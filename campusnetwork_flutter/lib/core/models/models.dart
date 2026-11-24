import '../network/api_client.dart';

class CNUser {
  const CNUser({
    required this.id,
    required this.username,
    required this.name,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.av,
    required this.bg,
    this.avatarUrl,
    this.bio = '',
    this.dept,
    this.isVerifiedStudent = false,
    this.isVerifiedStaff = false,
    this.emailVerified = false,
    this.followersCount = 0,
    this.followingCount = 0,
    this.questionsCount = 0,
    this.answersCount = 0,
    this.title = '',
  });

  final int id;
  final String username;
  final String name;
  final String firstName;
  final String lastName;
  final String email;
  final String av;
  final String bg;
  final String? avatarUrl;
  final String bio;
  final String? dept;
  final bool isVerifiedStudent;
  final bool isVerifiedStaff;
  final bool emailVerified;
  final int followersCount;
  final int followingCount;
  final int questionsCount;
  final int answersCount;
  final String title;

  factory CNUser.fromJson(Map<String, dynamic> j) {
    final fn = (j['first_name'] ?? '').toString();
    final ln = (j['last_name'] ?? '').toString();
    final uname = (j['username'] ?? '').toString();
    final display = (j['name'] ?? '$fn $ln').toString().trim();
    return CNUser(
      id: (j['id'] as num?)?.toInt() ?? 0,
      username: uname,
      name: display.isNotEmpty ? display : uname,
      firstName: fn,
      lastName: ln,
      email: (j['email'] ?? '').toString(),
      av: (j['av'] ?? (display.isNotEmpty ? display[0] : 'C')).toString(),
      bg: (j['bg'] ?? j['avatar_bg'] ?? '#3B82F6').toString(),
      avatarUrl: normalizeMediaUrl(j['avatar_url']?.toString()),
      bio: (j['bio'] ?? '').toString(),
      dept: j['dept'] is Map ? j['dept']['name']?.toString() : j['dept']?.toString(),
      isVerifiedStudent: j['is_verified_student'] == true,
      isVerifiedStaff: j['is_verified_staff'] == true || j['staff'] == true,
      emailVerified: j['email_verified'] == true,
      followersCount: (j['followers_count'] ?? j['followers'] as num?)?.toInt() ?? 0,
      followingCount: (j['following_count'] ?? j['following'] as num?)?.toInt() ?? 0,
      questionsCount: (j['questions_count'] ?? j['questions'] as num?)?.toInt() ?? 0,
      answersCount: (j['answers_count'] ?? j['answers'] as num?)?.toInt() ?? 0,
      title: (j['title'] ?? '').toString(),
    );
  }
}

class DepartmentItem {
  const DepartmentItem({
    required this.id,
    required this.name,
    this.color = '#4A90FF',
    this.questionsCount = 0,
  });

  final int id;
  final String name;
  final String color;
  final int questionsCount;

  factory DepartmentItem.fromJson(Map<String, dynamic> j) => DepartmentItem(
        id: (j['id'] as num?)?.toInt() ?? 0,
        name: (j['name'] ?? '').toString(),
        color: (j['color'] ?? '#4A90FF').toString(),
        questionsCount: (j['questions_count'] as num?)?.toInt() ?? 0,
      );
}

class PollOptionItem {
  const PollOptionItem({
    required this.id,
    required this.text,
    required this.votes,
    required this.percent,
    required this.voted,
  });

  final int id;
  final String text;
  final int votes;
  final int percent;
  final bool voted;

  factory PollOptionItem.fromJson(Map<String, dynamic> j) => PollOptionItem(
        id: (j['id'] as num?)?.toInt() ?? 0,
        text: (j['text'] ?? '').toString(),
        votes: (j['votes'] as num?)?.toInt() ?? 0,
        percent: (j['percent'] as num?)?.toInt() ?? 0,
        voted: j['voted'] == true,
      );
}

class QuestionMediaItem {
  const QuestionMediaItem({required this.id, required this.kind, required this.url});
  final int id;
  final String kind;
  final String url;

  factory QuestionMediaItem.fromJson(Map<String, dynamic> j) => QuestionMediaItem(
        id: (j['id'] as num?)?.toInt() ?? 0,
        kind: (j['kind'] ?? 'image').toString(),
        url: normalizeMediaUrl(j['url']?.toString()) ?? '',
      );
}

class QuestionItem {
  const QuestionItem({
    required this.id,
    required this.publicId,
    required this.userId,
    required this.authorName,
    required this.authorUsername,
    required this.authorAv,
    required this.authorBg,
    this.authorAvatarUrl,
    this.authorStaff = false,
    this.authorVerified = false,
    required this.dept,
    required this.time,
    required this.title,
    required this.body,
    required this.tags,
    required this.votes,
    required this.likes,
    required this.ans,
    required this.views,
    this.voted,
    this.liked = false,
    this.saved = false,
    this.answered = false,
    this.promoted = false,
    this.canDelete = false,
    this.canEdit = false,
    this.media = const [],
    this.pollOptions = const [],
    this.pollTotalVotes = 0,
  });

  final int id;
  final String publicId;
  final int? userId;
  final String authorName;
  final String authorUsername;
  final String authorAv;
  final String authorBg;
  final String? authorAvatarUrl;
  final bool authorStaff;
  final bool authorVerified;
  final String dept;
  final String time;
  final String title;
  final String body;
  final List<String> tags;
  final int votes;
  final int likes;
  final int ans;
  final int views;
  final String? voted;
  final bool liked;
  final bool saved;
  final bool answered;
  final bool promoted;
  final bool canDelete;
  final bool canEdit;
  final List<QuestionMediaItem> media;
  final List<PollOptionItem> pollOptions;
  final int pollTotalVotes;

  QuestionItem copyWith({
    int? votes,
    int? likes,
    int? ans,
    String? voted,
    bool clearVoted = false,
    bool? liked,
    bool? saved,
    List<PollOptionItem>? pollOptions,
    int? pollTotalVotes,
  }) =>
      QuestionItem(
        id: id,
        publicId: publicId,
        userId: userId,
        authorName: authorName,
        authorUsername: authorUsername,
        authorAv: authorAv,
        authorBg: authorBg,
        authorAvatarUrl: authorAvatarUrl,
        authorStaff: authorStaff,
        authorVerified: authorVerified,
        dept: dept,
        time: time,
        title: title,
        body: body,
        tags: tags,
        votes: votes ?? this.votes,
        likes: likes ?? this.likes,
        ans: ans ?? this.ans,
        views: views,
        voted: clearVoted ? null : (voted ?? this.voted),
        liked: liked ?? this.liked,
        saved: saved ?? this.saved,
        answered: answered,
        promoted: promoted,
        canDelete: canDelete,
        canEdit: canEdit,
        media: media,
        pollOptions: pollOptions ?? this.pollOptions,
        pollTotalVotes: pollTotalVotes ?? this.pollTotalVotes,
      );

  factory QuestionItem.fromJson(Map<String, dynamic> j) {
    final u = j['user'] is Map ? Map<String, dynamic>.from(j['user'] as Map) : <String, dynamic>{};
    return QuestionItem(
      id: (j['id'] as num?)?.toInt() ?? 0,
      publicId: (j['public_id'] ?? j['id'] ?? '').toString(),
      userId: (u['id'] as num?)?.toInt(),
      authorName: (u['name'] ?? 'Unknown').toString(),
      authorUsername: (u['username'] ?? '').toString(),
      authorAv: (u['av'] ?? '?').toString(),
      authorBg: (u['bg'] ?? '#3B82F6').toString(),
      authorAvatarUrl: normalizeMediaUrl(u['avatar_url']?.toString()),
      authorStaff: u['staff'] == true,
      authorVerified: u['is_verified_student'] == true,
      dept: (j['dept'] ?? u['dept'] ?? 'General').toString(),
      time: (j['time'] ?? '').toString(),
      title: (j['title'] ?? '').toString(),
      body: (j['body'] ?? '').toString(),
      tags: (j['tags'] as List? ?? []).map((e) => e.toString()).toList(),
      votes: (j['votes'] as num?)?.toInt() ?? 0,
      likes: (j['likes'] as num?)?.toInt() ?? 0,
      ans: (j['ans'] as num?)?.toInt() ?? 0,
      views: (j['views'] as num?)?.toInt() ?? 0,
      voted: j['voted']?.toString(),
      liked: j['liked'] == true,
      saved: j['saved'] == true,
      answered: j['answered'] == true,
      promoted: j['promoted'] == true,
      canDelete: j['can_delete'] == true,
      canEdit: j['can_edit'] == true,
      media: (j['media'] as List? ?? [])
          .whereType<Map>()
          .map((m) => QuestionMediaItem.fromJson(Map<String, dynamic>.from(m)))
          .toList(),
      pollOptions: (j['poll_options'] as List? ?? [])
          .whereType<Map>()
          .map((o) => PollOptionItem.fromJson(Map<String, dynamic>.from(o)))
          .toList(),
      pollTotalVotes: (j['poll_total_votes'] as num?)?.toInt() ?? 0,
    );
  }
}

class CommentItem {
  const CommentItem({
    required this.id,
    required this.userId,
    required this.authorName,
    required this.authorUsername,
    required this.authorAv,
    required this.authorBg,
    this.authorAvatarUrl,
    this.authorStaff = false,
    this.authorVerified = false,
    required this.body,
    required this.time,
    required this.upvotes,
    required this.downvotes,
    this.myVote,
    this.replies = const [],
  });

  final int id;
  final int? userId;
  final String authorName;
  final String authorUsername;
  final String authorAv;
  final String authorBg;
  final String? authorAvatarUrl;
  final bool authorStaff;
  final bool authorVerified;
  final String body;
  final String time;
  final int upvotes;
  final int downvotes;
  final String? myVote;
  final List<CommentItem> replies;

  factory CommentItem.fromJson(Map<String, dynamic> j) {
    final u = j['user'] is Map ? Map<String, dynamic>.from(j['user'] as Map) : <String, dynamic>{};
    return CommentItem(
      id: (j['id'] as num?)?.toInt() ?? 0,
      userId: (u['id'] as num?)?.toInt(),
      authorName: (u['name'] ?? 'Unknown').toString(),
      authorUsername: (u['username'] ?? '').toString(),
      authorAv: (u['av'] ?? '?').toString(),
      authorBg: (u['bg'] ?? '#3B82F6').toString(),
      authorAvatarUrl: normalizeMediaUrl(u['avatar_url']?.toString()),
      authorStaff: u['staff'] == true,
      authorVerified: u['is_verified_student'] == true,
      body: (j['body'] ?? '').toString(),
      time: (j['time'] ?? '').toString(),
      upvotes: (j['upvotes'] as num?)?.toInt() ?? 0,
      downvotes: (j['downvotes'] as num?)?.toInt() ?? 0,
      myVote: j['my_vote']?.toString(),
      replies: (j['replies'] as List? ?? [])
          .whereType<Map>()
          .map((r) => CommentItem.fromJson(Map<String, dynamic>.from(r)))
          .toList(),
    );
  }
}

class ServedAd {
  const ServedAd({
    required this.id,
    required this.headline,
    required this.description,
    this.imageUrl,
    this.destinationUrl,
    this.ctaText = 'Learn More',
    this.advertiserName = 'Campus Partner',
  });

  final int id;
  final String headline;
  final String description;
  final String? imageUrl;
  final String? destinationUrl;
  final String ctaText;
  final String advertiserName;

  factory ServedAd.fromJson(Map<String, dynamic> j) => ServedAd(
        id: (j['id'] as num?)?.toInt() ?? 0,
        headline: (j['headline'] ?? j['title'] ?? '').toString(),
        description: (j['description'] ?? j['body'] ?? '').toString(),
        imageUrl: normalizeMediaUrl(j['image_url']?.toString()),
        destinationUrl: j['destination_url']?.toString(),
        ctaText: (j['cta_text'] ?? 'Learn More').toString(),
        advertiserName: (j['advertiser_name'] ?? 'Campus Partner').toString(),
      );
}

class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.type,
    required this.text,
    required this.link,
    required this.read,
    required this.time,
  });

  final int id;
  final String type;
  final String text;
  final String link;
  final bool read;
  final String time;

  NotificationItem copyWith({bool? read}) => NotificationItem(
        id: id,
        type: type,
        text: text,
        link: link,
        read: read ?? this.read,
        time: time,
      );

  factory NotificationItem.fromJson(Map<String, dynamic> j) => NotificationItem(
        id: (j['id'] as num?)?.toInt() ?? 0,
        type: (j['type'] ?? 'system').toString(),
        text: (j['text'] ?? '').toString(),
        link: (j['link'] ?? '').toString(),
        read: j['read'] == true,
        time: (j['time'] ?? '').toString(),
      );
}
