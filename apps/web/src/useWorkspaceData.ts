import type { GlobalPlanItem } from "@/components/dashboard/GlobalDashboard";
import type { Activity, MarkdownFile, Plan, Project } from "@statedock/core";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "./api";
import { createRefreshRunner, freshCached, startVisiblePolling } from "./workspace-sync";

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
  const planCache = useRef(new Map<string, { value: Plan[]; at: number }>());
  const runRefresh = useRef(createRefreshRunner());
  const project = projects.find((p) => p.id === projectId);

  function refresh(automatic = false): Promise<void> {
    const generation = request.current;
    return runRefresh.current(
      `${generation}:${projectId}`,
      async () => {
        if (generation === request.current) await refreshData();
      },
      automatic,
    );
  }

  async function refreshData() {
    const token = request.current;
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
      const globalResults = Promise.allSettled(
        ps.map(async (p) => {
          const cached = freshCached(planCache.current.get(p.id), Date.now(), 30000);
          const list =
            p.id === projectId
              ? await currentPlans
              : (cached ?? (await api<Plan[]>(`${base(p.id)}/plans`)));
          // Only a successful network read updates freshness; cache hits do not.
          if (token === request.current && (p.id === projectId || cached === undefined))
            planCache.current.set(p.id, { value: list, at: Date.now() });
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
        const currentData = Promise.allSettled([
          currentPlans,
          api<MarkdownFile[]>(`${base(projectId)}/files`),
          api<Activity[]>(`${base(projectId)}/activity?limit=100`),
        ]);
        // Wait for every read even if one fails, keeping the next tick from overlapping.
        await Promise.allSettled([currentData, globalResults]);
        const results = await currentData;
        if (token !== request.current) return;
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        const [pl, fs, ac] = results;
        if (pl.status === "fulfilled" && fs.status === "fulfilled" && ac.status === "fulfilled") {
          setPlans(pl.value);
          setFiles(fs.value);
          setActivity(ac.value);
        }
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
    request.current++;
    localStorage.setItem("statedock.project", projectId);
    setPlans([]);
    setFiles([]);
    setActivity([]);
    const stopPolling = startVisiblePolling(() => refresh(true));
    return () => {
      stopPolling();
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
