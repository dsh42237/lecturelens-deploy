"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../components/AppLayout";
import {
  listSemesters,
  createSemester,
  deleteSemester,
  listCourses,
  createCourse,
  deleteCourse,
  enrichCourse,
  getMe,
} from "../../lib/api";

interface Semester {
  id: number;
  season: string;
  year: number;
}

interface Course {
  id: number;
  semester_id: number;
  course_code: string;
  course_name: string;
  context_summary?: string | null;
}

export default function SemestersPage() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<number | null>(null);
  const [showSemesterForm, setShowSemesterForm] = useState(false);
  const [season, setSeason] = useState("fall");
  const [year, setYear] = useState(new Date().getFullYear());
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [expandedCourses, setExpandedCourses] = useState<Set<number>>(
    new Set(),
  );
  const [authRequired, setAuthRequired] = useState(false);

  const refresh = async (semesterId?: number | null) => {
    try {
      const items = await listSemesters();
      setSemesters(items);
      const current = semesterId ?? items[0]?.id ?? null;
      setSelectedSemester(current);
      if (current) {
        const courseItems = await listCourses(current);
        setCourses(courseItems);
      } else {
        setCourses([]);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load");
    }
  };

  useEffect(() => {
    const init = async () => {
      const me = await getMe();
      if (me) {
        setAuthRequired(false);
        await refresh(null);
      } else {
        setAuthRequired(true);
      }
    };
    init();
  }, []);

  const handleAddSemester = async () => {
    setStatus(null);
    try {
      const item = await createSemester({ season, year });
      setShowSemesterForm(false);
      await refresh(item.id);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to add semester");
    }
  };

  const handleDeleteSemester = async (id: number) => {
    setStatus(null);
    await deleteSemester(id);
    await refresh(null);
  };

  const handleSelectSemester = async (id: number) => {
    setSelectedSemester(id);
    const courseItems = await listCourses(id);
    setCourses(courseItems);
  };

  const handleAddCourse = async () => {
    if (!selectedSemester) {
      setStatus("Select a semester first");
      return;
    }
    setStatus(null);
    try {
      await createCourse({
        semester_id: selectedSemester,
        course_code: courseCode,
        course_name: courseName,
      });
      setCourseCode("");
      setCourseName("");
      const courseItems = await listCourses(selectedSemester);
      setCourses(courseItems);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to add course");
    }
  };

  const handleDeleteCourse = async (id: number) => {
    if (!selectedSemester) return;
    await deleteCourse(id);
    const courseItems = await listCourses(selectedSemester);
    setCourses(courseItems);
  };

  const handleEnrichCourse = async (id: number) => {
    if (!selectedSemester) return;
    setStatus(null);
    try {
      await enrichCourse(id);
      const courseItems = await listCourses(selectedSemester);
      setCourses(courseItems);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Enrich failed");
    }
  };

  const toggleCourse = (id: number) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <AppLayout>
      <main className="page-shell">
        <div className="page-card">
          {/* <div className="page-header compact">
            <div>
              <h1>Semesters & Courses</h1>
              <p className="muted">Organize courses by term and keep summaries tidy.</p>
            </div>
          </div> */}

          {authRequired && (
            <div className="context-card">
              <h3>Login required</h3>
              <p className="muted">
                Please sign in on the Profile page to manage semesters.
              </p>
              <div className="form-actions">
                <a className="secondary-btn" href="/profile">
                  Go to Profile
                </a>
              </div>
            </div>
          )}

          {!authRequired && (
            <>
              <div className="semester-bar compact">
                <div>
                  <h2>Semester</h2>
                  {semesters.length === 0 && (
                    <p className="muted">No semesters yet.</p>
                  )}
                  <div className="semester-pills">
                    {semesters.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`semester-pill ${selectedSemester === item.id ? "active" : ""}`}
                        onClick={() => handleSelectSemester(item.id)}
                      >
                        {item.season} {item.year}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="semester-pill add"
                      onClick={() => setShowSemesterForm((prev) => !prev)}
                    >
                      {showSemesterForm ? "Close" : "Add semester"}
                    </button>
                  </div>
                </div>
              </div>

              {showSemesterForm && (
                <div className="semester-form">
                  <div className="form-row">
                    <label>Season</label>
                    <select
                      className="input"
                      value={season}
                      onChange={(e) => setSeason(e.target.value)}
                    >
                      <option value="winter">Winter</option>
                      <option value="spring">Spring</option>
                      <option value="summer">Summer</option>
                      <option value="fall">Fall</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Year</label>
                    <input
                      className="input"
                      type="number"
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      className="primary-btn"
                      type="button"
                      onClick={handleAddSemester}
                    >
                      Save semester
                    </button>
                  </div>
                </div>
              )}

              <div className="courses-shell compact">
                <div className="courses-header">
                  <h2>Courses</h2>
                  <p className="muted">
                    Add courses for the selected semester.
                  </p>
                </div>
                <div className="course-form course-form-inline">
                  <div className="form-row">
                    <label>Course code</label>
                    <input
                      className="input"
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      placeholder="PSY 101"
                    />
                  </div>
                  <div className="form-row">
                    <label>Course name</label>
                    <input
                      className="input"
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      placeholder="Introduction to Psychology"
                    />
                  </div>
                  <div className="form-row form-actions-inline">
                    <label className="sr-only">Add course</label>
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={handleAddCourse}
                    >
                      Add course
                    </button>
                  </div>
                </div>
                {courses.length === 0 && (
                  <p className="muted">No courses yet.</p>
                )}
                <div className="course-grid">
                  {courses.map((course) => (
                    <div key={course.id} className="course-card">
                      <div className="course-title">
                        <strong>{course.course_code}</strong>
                        <span>{course.course_name}</span>
                      </div>
                      <div className="course-actions">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => handleEnrichCourse(course.id)}
                        >
                          Enrich
                        </button>
                        {course.context_summary && (
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => toggleCourse(course.id)}
                          >
                            {expandedCourses.has(course.id)
                              ? "Hide details"
                              : "Show details"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => handleDeleteCourse(course.id)}
                        >
                          Remove
                        </button>
                      </div>
                      {course.context_summary &&
                        expandedCourses.has(course.id) && (
                          <pre className="context-inline">
                            {course.context_summary}
                          </pre>
                        )}
                    </div>
                  ))}
                </div>
              </div>

              {status && <div className="inline-error">{status}</div>}
            </>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
