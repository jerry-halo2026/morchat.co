
/**
 * Department: the org unit inside one workspace (docs/engineering/ORG-MODEL.md).
 * It is attribution — which unit a member belongs to, which unit a project or
 * knowledge space is filed under — never an access rule, so no client may use it
 * to decide what to render for the current viewer.
 */
export interface Department {
  id: string;
  workspace_id: string;
  name: string;
  /** Department head, or null. Must be a member of the same workspace. */
  lead_user_id: string | null;
  /** Set only for server-managed departments; null otherwise. */
  system_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListDepartmentsResponse {
  departments: Department[];
  total: number;
}

export interface CreateDepartmentRequest {
  name: string;
  lead_user_id?: string | null;
  system_key?: string | null;
}

/**
 * PATCH semantics: an omitted field keeps its stored value, and an empty string
 * for `lead_user_id` / `system_key` clears it.
 */
export interface UpdateDepartmentRequest {
  name?: string;
  lead_user_id?: string | null;
  system_key?: string | null;
}

/** What a department delete detached, so the caller can report it. */
export interface DeleteDepartmentResponse {
  detached_projects: number;
  detached_members: number;
}

/**
 * `department_id: null` clears the attribution: the member leaves the private
 * projects of the old department and joins none of the new one's.
 */
export interface UpdateMemberDepartmentRequest {
  department_id: string | null;
}

/**
 * The move also rewrites the member's project memberships, so the response
 * names the projects it added and dropped — counts would not tell an operator
 * which projects changed.
 */
export interface UpdateMemberDepartmentResponse {
  department_id: string | null;
  added_projects: string[];
  removed_projects: string[];
}
