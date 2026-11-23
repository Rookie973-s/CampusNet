import { api, apiUpload } from "./client";

export async function submitApplication({
  fname, lname, email, phone, staffId, departmentId, role, bio, why, refs, profilePicture,
}) {
  if (profilePicture) {
    const form = new FormData();
    form.append("first_name", fname);
    form.append("last_name", lname);
    form.append("email", email);
    form.append("phone", phone || "");
    form.append("staff_id", staffId);
    if (departmentId) form.append("department", departmentId);
    form.append("role_title", role);
    form.append("academic_references", refs || "");
    form.append("bio", bio);
    form.append("why", why);
    form.append("profile_picture", profilePicture);
    return apiUpload("/applications/", form);
  }
  return api.post("/applications/", {
    first_name: fname,
    last_name: lname,
    email,
    phone: phone || "",
    staff_id: staffId,
    department: departmentId || null,
    role_title: role,
    academic_references: refs || "",
    bio,
    why,
  });
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
