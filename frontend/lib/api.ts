const FALLBACK_API_BASE = "http://localhost:8000";

function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return FALLBACK_API_BASE;
}

async function safeFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err) {
    const origin = typeof window !== "undefined" ? window.location.origin : "server";
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Network error calling API ${url} (page origin: ${origin}). ` +
        `Is the backend running and reachable? (Cause: ${cause})`,
      { cause: err as unknown }
    );
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const res = await safeFetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "include"
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export interface UserInfo {
  id: number;
  email: string;
}

export interface MobileLinkInfo {
  token: string;
  expiresInSeconds: number;
}

export interface ProfileInfo {
  full_name?: string | null;
  program_name?: string | null;
  institution?: string | null;
  context_summary?: string | null;
}

export interface SemesterInfo {
  id: number;
  season: string;
  year: number;
}

export interface CourseInfo {
  id: number;
  semester_id: number;
  course_code: string;
  course_name: string;
  context_summary?: string | null;
}

export interface SessionInfo {
  id: string;
  course_id?: number | null;
  course_code?: string | null;
  course_name?: string | null;
  started_at: string;
  ended_at?: string | null;
  final_notes_text?: string | null;
  student_notes_text?: string | null;
  live_notes_history?: { timestamp: number; notes: Record<string, unknown> }[];
}

export async function register(email: string, password: string): Promise<UserInfo> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function login(email: string, password: string): Promise<UserInfo> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function createMobileLink(sessionId: string): Promise<MobileLinkInfo> {
  return request("/auth/mobile-link", {
    method: "POST",
    body: JSON.stringify({ sessionId })
  });
}

export async function exchangeMobileLinkToken(token: string, sessionId: string): Promise<UserInfo> {
  return request("/auth/mobile-exchange", {
    method: "POST",
    body: JSON.stringify({ token, sessionId })
  });
}

export async function logout() {
  return request("/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<UserInfo | null> {
  const url = `${getApiBase()}/auth/me`;
  const res = await safeFetch(url, { credentials: "include" });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function getProfile(): Promise<ProfileInfo> {
  return request("/profile");
}

export async function updateProfile(payload: { full_name?: string; program_name?: string; institution?: string }): Promise<ProfileInfo> {
  return request("/profile", { method: "PUT", body: JSON.stringify(payload) });
}

export async function enrichProfile(): Promise<ProfileInfo> {
  return request("/profile/enrich", { method: "POST" });
}

export async function listSemesters(): Promise<SemesterInfo[]> {
  return request("/semesters");
}

export async function createSemester(payload: { season: string; year: number }): Promise<SemesterInfo> {
  return request("/semesters", { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteSemester(id: number) {
  return request(`/semesters/${id}`, { method: "DELETE" });
}

export async function listCourses(semesterId?: number): Promise<CourseInfo[]> {
  const qs = semesterId ? `?semester_id=${semesterId}` : "";
  return request(`/courses${qs}`);
}

export async function createCourse(payload: {
  semester_id: number;
  course_code: string;
  course_name: string;
}): Promise<CourseInfo> {
  return request("/courses", { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteCourse(id: number) {
  return request(`/courses/${id}`, { method: "DELETE" });
}

export async function enrichCourse(id: number): Promise<CourseInfo> {
  return request(`/courses/${id}/enrich`, { method: "POST" });
}

export async function listSessions(): Promise<SessionInfo[]> {
  return request("/sessions");
}

export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  return request(`/sessions/${id}`, { method: "DELETE" });
}
