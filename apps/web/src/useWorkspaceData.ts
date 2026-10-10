import type { GlobalPlanItem } from "@/components/dashboard/GlobalDashboard";
import type { Activity, MarkdownFile, Plan, Project } from "@statedock/core";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "./api";

const base = (id: string) => `/projects/${encodeURIComponent(id)}`;

export function useWorkspaceData(
  projectId: string,
  setProjectId: Dispatch<SetStateAction<string>>,
) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [synced, setSynced] = useState<Date | null>(null);
  const [allPlans, setAllPlans] = useState<GlobalPlanItem[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);

  const request = useRef(0);
  const planCache = useRef(new Map<string, { plans: Plan[]; at: number }>());
  const project = projects.find((p) => p.id === projectId);

  async function refresh() {
    const token = ++request.current;
    setError("");
    try {
      const ps = await api<Project[]>("/projects");
      if (token !== request.current) return;
      setProjects(ps);
      if (!ps.some((p) => p.id === projectId)) {
        setProjectId(ps[0]?.id ?? "");
        setLoaded(true);
        return;
      }

      const currentPlans = api<Plan[]>(`${base(projectId)}/plans`);
      // Reuse selected-project data and briefly cache other projects.
      setGlobalLoading(true);
      void Promise.allSettled(
        ps.map(async (p) => {
          const cached = planCache.current.get(p.id);
          const list =
            p.id === projectId
              ? await currentPlans
              : cached && Date.now() - cached.at < 30000
                ? cached.plans
                : await api<Plan[]>(`${base(p.id)}/plans`);
          planCache.current.set(p.id, { plans: list, at: Date.now() });
          return list.map((plan) => ({ plan, project: p }));
        }),
      ).then((results) => {
        if (token !== request.current) return;
        const flattened: GlobalPlanItem[] = [];
        for (const res of results) {
          if (res.status === "fulfilled") {
            flattened.push(...res.value);
          }
        }
        if (results.some((result) => result.status === "rejected"))
          setError("Some project data could not be refreshed. Please retry.");
        setAllPlans(flattened);
        setGlobalLoading(false);
      });

      if (projectId) {
        const [pl, fs, ac] = await Promise.all([
          currentPlans,
          api<MarkdownFile[]>(`${base(projectId)}/files`),
          api<Activity[]>(`${base(projectId)}/activity?limit=100`),
        ]);
        if (token !== request.current) return;
        setPlans(pl);
        setFiles(fs);
        setActivity(ac);
      }
      setLoaded(true);
      setSynced(new Date());
    } catch (e) {
      if (token === request.current) {
        setError((e as Error).message);
        setLoaded(true);
      }
    }
  }

  useEffect(() => {
    localStorage.setItem("statedock.project", projectId);
    setPlans([]);
    setFiles([]);
    setActivity([]);
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      clearInterval(timer);
      request.current++;
    };
  }, [projectId]);

  return {
    projects,
    project,
    plans,
    files,
    activity,
    allPlans,
    globalLoading,
    loaded,
    synced,
    error,
    setError,
    refresh,
  };
}
