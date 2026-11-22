import os

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import parsers, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from config.security import validate_and_reencode_image
from library.validators import sanitize_filename
from notifications.models import Notification
from notifications.services import notify

from .models import Conversation, Message, SavedChatQuestion
from .serializers import ConversationSerializer, MessageSerializer, SavedChatQuestionSerializer

User = get_user_model()

MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_CHAT_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".txt", ".doc", ".docx"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _is_sug_or_staff(user) -> bool:
    return bool(user and user.is_active and (user.is_verified_staff or user.role == User.Role.STAFF))


class ConversationViewSet(viewsets.GenericViewSet):
    """
    GET  /api/chats/                                 — list current user's conversations
    POST /api/chats/start/                           — {sug_id, message?} open or reuse convo with a verified SUG rep
    GET  /api/chats/{id}/messages/                   — list messages (marks counterpart messages read)
    POST /api/chats/{id}/messages/                   — send a message (optional attachment)
    POST /api/chats/{id}/read/                       — mark all counterpart messages read
    POST /api/chats/messages/{msg_id}/save/          — toggle saving a question/message from chat
    GET  /api/chats/saved/                           — list saved chat questions
    """

    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get_queryset(self):
        u = self.request.user
        qs = Conversation.objects.filter(Q(student=u) | Q(sug_rep=u)).select_related(
            "student", "student__department", "sug_rep", "sug_rep__department"
        )
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(sug_rep__first_name__icontains=search)
                | Q(sug_rep__last_name__icontains=search)
                | Q(sug_rep__username__icontains=search)
                | Q(student__first_name__icontains=search)
                | Q(student__last_name__icontains=search)
                | Q(student__username__icontains=search)
            )
        return qs.order_by("-updated_at")

    def list(self, request):
        qs = self.get_queryset()
        ser = ConversationSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)

    def retrieve(self, request, pk=None):
        convo = self.get_object()
        return Response(ConversationSerializer(convo, context={"request": request}).data)

    @action(detail=False, methods=["post"])
    def start(self, request):
        """Start or reopen a conversation with a verified SUG representative (NO student-to-student DM)."""
        sug_id = request.data.get("sug_id")
        if not sug_id:
            return Response({"detail": "sug_id is required."}, status=400)
        sug_rep = get_object_or_404(User, pk=sug_id, is_active=True)
        if not _is_sug_or_staff(sug_rep):
            return Response(
                {"detail": "Direct messaging is strictly available with verified SUG representatives and staff."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if sug_rep.pk == request.user.pk:
            return Response({"detail": "You cannot start a conversation with yourself."}, status=400)

        try:
            with transaction.atomic():
                convo, created = Conversation.objects.get_or_create(
                    student=request.user,
                    sug_rep=sug_rep,
                )
        except IntegrityError:
            convo = Conversation.objects.get(student=request.user, sug_rep=sug_rep)
            created = False

        initial_text = (request.data.get("message") or "").strip()
        if initial_text:
            Message.objects.create(conversation=convo, sender=request.user, body=initial_text[:4000])
            convo.updated_at = timezone.now()
            convo.save(update_fields=["updated_at"])
            notify(
                sug_rep,
                notif_type=Notification.Type.CHAT,
                text=f"New SUG message from {request.user.display_name}.",
                actor=request.user,
                link=f"/chats?c={convo.pk}",
            )

        data = ConversationSerializer(convo, context={"request": request}).data
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        convo = self.get_object()  # queryset already restricts to participant!

        if request.method == "GET":
            # Mark incoming messages as read
            convo.messages.filter(is_read=False).exclude(sender=request.user).update(
                is_read=True, read_at=timezone.now()
            )
            qs = convo.messages.select_related("sender", "sender__department").order_by("created_at", "id")
            before_id = request.query_params.get("before")
            if before_id and before_id.isdigit():
                qs = qs.filter(id__lt=int(before_id))
            msgs = list(qs[:100])
            return Response(MessageSerializer(msgs, many=True, context={"request": request}).data)

        # POST send message
        body = (request.data.get("body") or "").strip()
        uploaded = request.FILES.get("attachment")
        if not body and not uploaded:
            return Response({"detail": "Enter a message or attach a file."}, status=400)
        if len(body) > 4000:
            return Response({"detail": "Message is too long (max 4,000 characters)."}, status=400)

        saved_file = None
        orig_name = ""
        size_bytes = 0
        if uploaded:
            if uploaded.size == 0:
                return Response({"detail": "Attached file is empty."}, status=400)
            if uploaded.size > MAX_CHAT_ATTACHMENT_BYTES:
                return Response({"detail": "Attachment exceeds 10 MB limit."}, status=400)
            orig_name = sanitize_filename(uploaded.name)
            _, ext = os.path.splitext(orig_name.lower())
            if ext not in ALLOWED_CHAT_EXTS:
                return Response({"detail": "Unsupported file type. Allowed: images, PDF, DOC/DOCX, TXT."}, status=400)
            if ext in IMAGE_EXTS:
                try:
                    saved_file = validate_and_reencode_image(uploaded, max_bytes=MAX_CHAT_ATTACHMENT_BYTES, max_dim=1600)
                except DjangoValidationError as e:
                    return Response({"detail": e.messages[0]}, status=400)
            else:
                saved_file = uploaded
            size_bytes = getattr(saved_file, "size", uploaded.size) or uploaded.size

        msg = Message.objects.create(
            conversation=convo,
            sender=request.user,
            body=body,
            attachment=saved_file,
            attachment_name=orig_name,
            attachment_size=size_bytes,
        )
        convo.updated_at = timezone.now()
        convo.save(update_fields=["updated_at"])

        recipient = convo.sug_rep if request.user.pk == convo.student_id else convo.student
        notify(
            recipient,
            notif_type=Notification.Type.CHAT,
            text=f"New message from {request.user.display_name}: {(body or orig_name)[:60]}",
            actor=request.user,
            link=f"/chats?c={convo.pk}",
            dedupe_seconds=30,
        )
        return Response(MessageSerializer(msg, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        convo = self.get_object()
        updated = convo.messages.filter(is_read=False).exclude(sender=request.user).update(
            is_read=True, read_at=timezone.now()
        )
        return Response({"marked_read": updated})

    @action(detail=False, methods=["post"], url_path=r"messages/(?P<msg_id>\d+)/save")
    def toggle_save_message(self, request, msg_id=None):
        """Save or unsave a question/message inside a chat thread the user participates in."""
        msg = get_object_or_404(
            Message.objects.select_related("conversation"),
            pk=msg_id,
        )
        if request.user.pk not in (msg.conversation.student_id, msg.conversation.sug_rep_id):
            return Response({"detail": "Not authorized."}, status=403)
        existing = SavedChatQuestion.objects.filter(user=request.user, message=msg).first()
        if existing:
            existing.delete()
            return Response({"saved": False})
        note = (request.data.get("note") or "").strip()[:255]
        SavedChatQuestion.objects.create(user=request.user, message=msg, note=note)
        return Response({"saved": True}, status=201)

    @action(detail=False, methods=["get"])
    def saved(self, request):
        qs = SavedChatQuestion.objects.filter(user=request.user).select_related(
            "message", "message__sender", "message__conversation"
        )
        return Response(SavedChatQuestionSerializer(qs, many=True, context={"request": request}).data)
