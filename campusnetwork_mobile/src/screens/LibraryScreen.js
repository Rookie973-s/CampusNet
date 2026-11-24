/**
 * Upgraded Academic PDF Library Screen
 * - Reusable FacultyDropdown + dependent Department Dropdown + MorphismSearchInput + Level pills
 * - Real backend-driven NativeAdCard (placement="library")
 * - Course folder drill-down, reliable PDF view/download, and authorized Class Rep PDF upload
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList, Linking, Pressable, RefreshControl, ScrollView, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ClayButton, ClayCard, ClayPill, FacultyDropdown, FeedSkeletonList,
  MorphismSearchInput, NativeAdCard,
} from "../components/ClayUI";
import { adsApi, libraryApi } from "../api";

const LEVELS = ["", "100", "200", "300", "400", "500"];

export default function LibraryScreen({ theme, user, onRequireAuth, toast }) {
  const [catalog, setCatalog] = useState({ faculties: [], departments: [] });
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");

  const [folders, setFolders] = useState([]);
  const [libAds, setLibAds] = useState([]);
  const [activeCourse, setActiveCourse] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    libraryApi.catalog()
      .then((c) => setCatalog({
        faculties: c?.faculties || [],
        departments: c?.departments || [],
      }))
      .catch(() => {});
    adsApi.serve("library").then((a) => setLibAds(a || [])).catch(() => {});
  }, [user]);

  const facultyOptions = useMemo(
    () => [
      { label: "All Faculties", value: "" },
      ...(catalog.faculties || []).map((f) => ({ label: f.name, value: String(f.id), color: f.color })),
    ],
    [catalog.faculties]
  );

  const visibleDepartments = useMemo(() => {
    const all = catalog.departments || [];
    if (!faculty) return all;
    return all.filter((d) => String(d.faculty) === String(faculty) || String(d.faculty_id) === String(faculty));
  }, [catalog.departments, faculty]);

  const deptOptions = useMemo(
    () => [
      { label: "All Departments", value: "" },
      ...visibleDepartments.map((d) => ({ label: d.name, value: String(d.id) })),
    ],
    [visibleDepartments]
  );

  const loadFolders = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await libraryApi.folders({ faculty, department, level, q });
      setFolders(res?.results || (Array.isArray(res) ? res : []));
    } catch (e) {
      toast && toast(e.message || "Could not load library folders.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, faculty, department, level, q, toast]);

  useEffect(() => {
    if (!activeCourse) loadFolders(false);
  }, [activeCourse, loadFolders]);

  const openCourse = async (course) => {
    setActiveCourse(course);
    setLoading(true);
    try {
      const res = await libraryApi.documents({ course: course.id });
      setDocs(res?.results || (Array.isArray(res) ? res : []));
    } catch (e) {
      toast && toast(e.message || "Could not load course PDFs.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPdf = async (doc) => {
    const url = doc.file_url || doc.download_url || doc.file;
    if (!url) {
      toast && toast("No PDF file link available.", "error");
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      toast && toast("Could not open PDF document.", "error");
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, justifyContent: "center" }}>
        <ClayCard theme={theme} level={2} style={{ padding: 26, alignItems: "center", gap: 10 }}>
          <Ionicons name="library-outline" size={48} color={theme.accent} />
          <Text style={{ color: theme.txt, fontSize: 20, fontWeight: "800" }}>Academic PDF Library</Text>
          <Text style={{ color: theme.mut, fontSize: 13.5, textAlign: "center", lineHeight: 20 }}>
            Sign in to browse course notes, lecture slides, and past questions organized by faculty, department, and level.
          </Text>
          <ClayButton theme={theme} variant="pri" label="Sign In to Access Library" onPress={() => onRequireAuth("access the PDF Library")} />
        </ClayCard>
      </View>
    );
  }

  if (activeCourse) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <FlatList
          data={loading ? [] : docs}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 12 }}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 4 }}>
              <Pressable onPress={() => { setActiveCourse(null); setDocs([]); }} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="arrow-back" size={18} color={theme.accent} />
                <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14 }}>All Folders</Text>
              </Pressable>
              <ClayCard theme={theme} level={2} style={{ padding: 16, gap: 4 }}>
                <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 12 }}>{activeCourse.code}</Text>
                <Text style={{ color: theme.txt, fontWeight: "900", fontSize: 19 }}>{activeCourse.title}</Text>
                <Text style={{ color: theme.mut, fontSize: 12.5 }}>
                  {activeCourse.department_name || ""} · {activeCourse.level}L
                </Text>
              </ClayCard>
              {loading ? <FeedSkeletonList theme={theme} count={3} /> : null}
            </View>
          }
          renderItem={({ item: doc }) => (
            <ClayCard theme={theme} level={1} style={{ padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.14)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="document-text" size={22} color="#EF4444" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 14.5 }} numberOfLines={2}>{doc.title}</Text>
                <Text style={{ color: theme.mut, fontSize: 12 }}>
                  {doc.doc_type || "Lecture Note"} · {doc.uploaded_by_name || "Class Rep"}
                </Text>
              </View>
              <ClayButton theme={theme} variant="pri" compact icon="download-outline" label="PDF" onPress={() => handleOpenPdf(doc)} />
            </ClayCard>
          )}
          ListEmptyComponent={
            !loading ? (
              <ClayCard theme={theme} style={{ padding: 26, alignItems: "center", gap: 6 }}>
                <Ionicons name="folder-open-outline" size={34} color={theme.faint} />
                <Text style={{ color: theme.mut }}>No PDFs uploaded in this course yet.</Text>
              </ClayCard>
            ) : null
          }
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={loading ? [] : folders}
        keyExtractor={(f) => String(f.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadFolders(true)} tintColor={theme.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={{ color: theme.txt, fontSize: 22, fontWeight: "900", flex: 1 }}>PDF Library</Text>
              <MorphismSearchInput
                theme={theme}
                value={q}
                onChangeText={setQ}
                placeholder="Search MTH 111..."
              />
            </View>

            {/* Reusable FacultyDropdown + Dependent Department Dropdown */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <FacultyDropdown
                theme={theme}
                options={facultyOptions}
                value={faculty}
                onChange={(v) => { setFaculty(v); setDepartment(""); }}
                placeholder="All Faculties"
                style={{ flex: 1 }}
              />
              {visibleDepartments.length > 0 ? (
                <FacultyDropdown
                  theme={theme}
                  options={deptOptions}
                  value={department}
                  onChange={setDepartment}
                  placeholder="All Depts"
                  icon="business-outline"
                  style={{ flex: 1 }}
                />
              ) : null}
            </View>

            {/* Retained Academic Level Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -14 }}
              contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 2 }}
            >
              {LEVELS.map((lv) => (
                <ClayPill
                  key={lv || "all"}
                  theme={theme}
                  label={lv ? `${lv} Level` : "All Levels"}
                  active={level === lv}
                  onPress={() => setLevel(lv)}
                />
              ))}
            </ScrollView>

            {/* Real Backend-Driven Library Ad */}
            {libAds[0] ? <NativeAdCard theme={theme} ad={libAds[0]} placement="library" /> : null}

            {loading ? <FeedSkeletonList theme={theme} count={3} /> : null}
          </View>
        }
        renderItem={({ item: folder }) => (
          <Pressable onPress={() => openCourse(folder)}>
            <ClayCard theme={theme} level={1} style={{ padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="folder" size={23} color={theme.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 12 }}>{folder.code}</Text>
                <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{folder.title}</Text>
                <Text style={{ color: theme.mut, fontSize: 12 }}>
                  {folder.department_name || folder.faculty_name || "ATBU"} · {folder.level}L · {folder.documents_count ?? 0} PDFs
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.faint} />
            </ClayCard>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <ClayCard theme={theme} style={{ padding: 28, alignItems: "center", gap: 8 }}>
              <Ionicons name="library-outline" size={38} color={theme.faint} />
              <Text style={{ color: theme.txt, fontWeight: "800", fontSize: 15 }}>No matching course folders</Text>
              <Text style={{ color: theme.mut, fontSize: 13, textAlign: "center" }}>
                Try clearing a filter or searching by course code.
              </Text>
            </ClayCard>
          ) : null
        }
      />
    </View>
  );
}
