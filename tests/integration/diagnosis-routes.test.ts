import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  diagnoseRun: vi.fn(),
  store: { get: vi.fn() },
  proposalStore: { getContextByDiagnosis: vi.fn() },
  buildProposalView: vi.fn(),
  deps: { marker: "diagnosis-deps" },
}));

vi.mock("@/server/access/session", () => ({
  getSessionUser: async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    email: "learner@example.com",
  }),
}));
vi.mock("@/server/diagnosis", () => ({
  diagnosisDeps: () => mocks.deps,
  getDiagnosisStore: () => mocks.store,
}));
vi.mock("@/server/diagnosis/service", () => ({ diagnoseRun: mocks.diagnoseRun }));
vi.mock("@/server/proposals", () => ({ getProposalStore: () => mocks.proposalStore }));
vi.mock("@/server/proposals/view", () => ({ buildProposalView: mocks.buildProposalView }));

import { GET as getDiagnosis } from "@/app/api/diagnoses/[id]/route";
import { POST as postDiagnosis } from "@/app/api/runs/[id]/diagnosis/route";

const USER = "00000000-0000-4000-8000-000000000001";
const RUN = "10000000-0000-4000-8000-000000000001";
const DIAGNOSIS = "20000000-0000-4000-8000-000000000001";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (path: string, method = "GET") => new Request(`http://test${path}`, { method });

beforeEach(() => vi.clearAllMocks());

describe("diagnosis routes", () => {
  it("passes the signed-in user and validated run id to the service", async () => {
    mocks.diagnoseRun.mockResolvedValue({ diagnosis: { id: DIAGNOSIS }, proposal: null });
    const response = await postDiagnosis(request(`/api/runs/${RUN}/diagnosis`, "POST"), params(RUN));

    expect(response.status).toBe(200);
    expect(mocks.diagnoseRun).toHaveBeenCalledWith(mocks.deps, { runId: RUN, userId: USER });
    expect(await response.json()).toEqual({ diagnosis: { id: DIAGNOSIS }, proposal: null });
  });

  it("rejects a malformed run id before invoking diagnosis", async () => {
    const response = await postDiagnosis(request("/api/runs/not-a-uuid/diagnosis", "POST"), params("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(mocks.diagnoseRun).not.toHaveBeenCalled();
  });

  it("returns only the signed-in user's diagnosis and its polled proposal", async () => {
    mocks.store.get.mockResolvedValue({ id: DIAGNOSIS, category: "invalid_format" });
    mocks.proposalStore.getContextByDiagnosis.mockResolvedValue({ proposal: { id: "proposal-1", status: "pending" } });
    mocks.buildProposalView.mockReturnValue({ id: "proposal-1", kind: "config_change" });
    const response = await getDiagnosis(request(`/api/diagnoses/${DIAGNOSIS}`), params(DIAGNOSIS));

    expect(response.status).toBe(200);
    expect(mocks.store.get).toHaveBeenCalledWith(DIAGNOSIS, USER);
    expect(mocks.proposalStore.getContextByDiagnosis).toHaveBeenCalledWith(DIAGNOSIS, USER);
    expect(await response.json()).toEqual({
      diagnosis: { id: DIAGNOSIS, category: "invalid_format" },
      proposal: { id: "proposal-1", kind: "config_change" },
    });
  });

  it("returns 404 when the diagnosis is absent or belongs to someone else", async () => {
    mocks.store.get.mockResolvedValue(undefined);
    const response = await getDiagnosis(request(`/api/diagnoses/${DIAGNOSIS}`), params(DIAGNOSIS));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("does not rebuild or expose a proposal after it is decided", async () => {
    mocks.store.get.mockResolvedValue({ id: DIAGNOSIS, category: "invalid_format" });
    mocks.proposalStore.getContextByDiagnosis.mockResolvedValue({ proposal: { id: "proposal-1", status: "decided" } });
    const response = await getDiagnosis(request(`/api/diagnoses/${DIAGNOSIS}`), params(DIAGNOSIS));
    expect(await response.json()).toEqual({ diagnosis: { id: DIAGNOSIS, category: "invalid_format" }, proposal: null });
    expect(mocks.buildProposalView).not.toHaveBeenCalled();
  });
});
