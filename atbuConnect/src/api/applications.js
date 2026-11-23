import { api, apiUpload } from "./client";

export async function submitApplication({
  fname, lname, email, phone, departmentId, academicDepartmentName, role, bio, why, refs,
  profilePicture, supportingDocument, livenessVideo,
}) {
  const form = new FormData();
  form.append("first_name", fname);
  form.append("last_name", lname);
  form.append("email", email);
  form.append("phone", phone || "");
  if (departmentId) form.append("department", departmentId);
  if (academicDepartmentName) form.append("academic_department_name", academicDepartmentName);
  form.append("role_title", role);
  form.append("academic_references", refs || "");
  form.append("bio", bio);
  form.append("why", why);
  if (profilePicture) form.append("profile_picture", profilePicture);
  if (supportingDocument) form.append("supporting_document", supportingDocument);
  if (livenessVideo) form.append("liveness_video", livenessVideo);
  return apiUpload("/applications/", form);
}

export async function checkApplicationStatus(email) {
  return api.get(`/applications/status/?email=${encodeURIComponent(email.trim())}`);
}

export async function cancelSugStatus() {
  return api.post("/applications/cancel-sug/", {}, { auth: "required" });
}

export async function cancelPendingSugApplication() {
  return api.post("/applications/cancel-pending/", {}, { auth: "required" });
}
