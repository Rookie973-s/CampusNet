import { api } from "./client";

export function flattenDept(d) {
  return { id: d.id, name: d.name, color: d.color, count: d.count };
}

export async function listDepartments() {
  const data = await api.get("/departments/");
  return (data.results || data).map(flattenDept);
}
