export interface GitHubProjectItem {
  id: string;
  type: string;
  content: {
    __typename: string;
    id?: string;
    number?: number;
    title?: string;
    body?: string;
    url?: string;
    createdAt?: string;
    closedAt?: string;
    state?: string;
    assignees?: {
      nodes: Array<{
        login: string;
        name: string;
        avatarUrl: string;
      }>;
    };
    labels?: {
      nodes: Array<{
        name: string;
        color: string;
      }>;
    };
    repository?: {
      nameWithOwner: string;
    };
    timelineItems?: {
      nodes: Array<{
        __typename: string;
        createdAt?: string;
        previousStatus?: string;
        status?: string;
      }>;
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  } | null;
  fieldValues: {
    nodes: Array<{
      __typename: string;
      name?: string;
      text?: string;
      date?: string;
      number?: number;
      field?: {
        name: string;
      };
    }>;
  };
}

export interface GitHubProjectData {
  title: string;
  items: GitHubProjectItem[];
}

/** One project item with only the fields needed to decide whether to refetch it. */
export interface GitHubProjectItemRef {
  id: string;
  updatedAt: string;
  isArchived: boolean;
  content: {
    __typename: string;
    id?: string;
    number?: number;
    createdAt?: string;
    updatedAt?: string;
  } | null;
}

export interface GitHubProjectRefsData {
  title: string;
  total: number;
  refs: GitHubProjectItemRef[];
}

/**
 * Detail selection for one ProjectV2Item. Kept identical to the selection in
 * fetchGitHubProjectItems so a selective refetch returns the same shape the
 * save path already understands.
 */
const PROJECT_ITEM_DETAIL_FIELDS = `
  id
  type
  content {
    __typename
    ... on Issue {
      id
      number
      title
      body
      url
      createdAt
      closedAt
      state
      assignees(first: 10) {
        nodes {
          login
          name
          avatarUrl
        }
      }
      labels(first: 10) {
        nodes {
          name
          color
        }
      }
      repository {
        nameWithOwner
      }
      timelineItems(first: 20, itemTypes: [PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]) {
        nodes {
          __typename
          ... on ProjectV2ItemStatusChangedEvent {
            createdAt
            previousStatus
            status
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
    ... on PullRequest {
      id
      number
      title
      body
      url
      createdAt
      closedAt: mergedAt
      state
      assignees(first: 10) {
        nodes {
          login
          name
          avatarUrl
        }
      }
      labels(first: 10) {
        nodes {
          name
          color
        }
      }
      repository {
        nameWithOwner
      }
      timelineItems(first: 20, itemTypes: [PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]) {
        nodes {
          __typename
          ... on ProjectV2ItemStatusChangedEvent {
            createdAt
            previousStatus
            status
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
  fieldValues(first: 20) {
    nodes {
      __typename
      ... on ProjectV2ItemFieldSingleSelectValue {
        name
        field {
          ... on ProjectV2SingleSelectField {
            name
          }
        }
      }
      ... on ProjectV2ItemFieldTextValue {
        text
        field {
          ... on ProjectV2Field {
            name
          }
        }
      }
      ... on ProjectV2ItemFieldDateValue {
        date
        field {
          ... on ProjectV2Field {
            name
          }
        }
      }
      ... on ProjectV2ItemFieldNumberValue {
        number
        field {
          ... on ProjectV2Field {
            name
          }
        }
      }
    }
  }
`;

/** Thrown when a running sync is cancelled by the user. */
export class SyncCancelledError extends Error {
  constructor() {
    super("Sync cancelled");
    this.name = "SyncCancelledError";
  }
}

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

function getHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is not set");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Smaller `items(first: ...)` page size for boards with lots of items, since
 * each item's nested timelineItems/fieldValues/assignees/labels connections
 * multiply the per-request complexity — see the comment at its call site.
 */
function pageSizeForTotal(total: number): number {
  if (total > 2000) return 15;
  if (total > 500) return 30;
  return 100;
}

/**
 * Fetch GitHub Project V2 items using GraphQL API.
 *
 * `onProgress(fetched, total)` is called after every page so callers can
 * persist live progress (e.g. into sync_logs). `total` is null until the
 * first page reveals `totalCount`. `shouldAbort` is polled between pages
 * and throws SyncCancelledError when the user cancels the sync.
 */
export async function fetchGitHubProjectItems(
  ownerLogin: string,
  projectNumber: number,
  ownerType: "user" | "organization" = "user",
  onProgress?: (fetched: number, total: number | null) => void,
  shouldAbort?: () => Promise<boolean>,
  options: { filter?: string } = {}
): Promise<GitHubProjectData> {
  const ownerQuery =
    ownerType === "organization"
      ? `organization(login: "${ownerLogin}")`
      : `user(login: "${ownerLogin}")`;

  // `filter` is optional so the full-sync request stays byte-for-byte the same
  // as before (no `query` argument at all when it is absent).
  const filter = options.filter?.trim() || "";

  const query = `
    query GetProjectItems($after: String, $first: Int!${filter ? ", $query: String!" : ""}) {
      ${ownerQuery} {
        projectV2(number: ${projectNumber}) {
          title
          items(first: $first, after: $after${filter ? ", query: $query" : ""}) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              type
              content {
                __typename
                ... on Issue {
                  id
                  number
                  title
                  body
                  url
                  createdAt
                  closedAt
                  state
                  assignees(first: 10) {
                    nodes {
                      login
                      name
                      avatarUrl
                    }
                  }
                  labels(first: 10) {
                    nodes {
                      name
                      color
                    }
                  }
                  repository {
                    nameWithOwner
                  }
                  timelineItems(first: 20, itemTypes: [PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]) {
                    nodes {
                      __typename
                      ... on ProjectV2ItemStatusChangedEvent {
                        createdAt
                        previousStatus
                        status
                      }
                    }
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                  }
                }
                ... on PullRequest {
                  id
                  number
                  title
                  body
                  url
                  createdAt
                  closedAt: mergedAt
                  state
                  assignees(first: 10) {
                    nodes {
                      login
                      name
                      avatarUrl
                    }
                  }
                  labels(first: 10) {
                    nodes {
                      name
                      color
                    }
                  }
                  repository {
                    nameWithOwner
                  }
                  timelineItems(first: 20, itemTypes: [PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]) {
                    nodes {
                      __typename
                      ... on ProjectV2ItemStatusChangedEvent {
                        createdAt
                        previousStatus
                        status
                      }
                    }
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                  }
                }
              }
              fieldValues(first: 20) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2SingleSelectField {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field {
                      ... on ProjectV2Field {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field {
                      ... on ProjectV2Field {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field {
                      ... on ProjectV2Field {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let allItems: GitHubProjectItem[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let projectTitle = "";
  // Each item nests timelineItems/fieldValues/assignees/labels, so a page of
  // items this size carries a lot of nested connections in one GraphQL call.
  // GitHub's API can silently return truncated nested data (no top-level
  // `errors`) once that gets too large, so boards with many items page
  // through with a smaller `first` once we know how big they are.
  let pageSize = 50;

  while (hasNextPage) {
    if (shouldAbort && (await shouldAbort())) {
      throw new SyncCancelledError();
    }
    const variables: Record<string, string | number | null> = {
      after: cursor,
      first: pageSize,
      ...(filter ? { query: filter } : {}),
    };

    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${text}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(
        `GraphQL errors: ${JSON.stringify(data.errors, null, 2)}`
      );
    }

    const owner = data.data?.[ownerType === "organization" ? "organization" : "user"];
    const project = owner?.projectV2;

    if (!project) {
      throw new Error(
        `Project #${projectNumber} not found for ${ownerLogin}. Make sure the project exists and token has access.`
      );
    }

    projectTitle = project.title;
    const items = project.items;

    if (allItems.length === 0 && typeof items.totalCount === "number") {
      pageSize = pageSizeForTotal(items.totalCount);
    }

    allItems = [...allItems, ...(items.nodes || [])];
    onProgress?.(
      allItems.length,
      typeof items.totalCount === "number" ? items.totalCount : null
    );

    hasNextPage = items.pageInfo.hasNextPage;
    cursor = items.pageInfo.endCursor;
  }

  // Status-change history is capped at 20 per item above; fetch the rest for
  // any item that hit that cap, so heavy-churn tickets don't lose history.
  for (const item of allItems) {
    if (shouldAbort && (await shouldAbort())) {
      throw new SyncCancelledError();
    }
    const content = item.content;
    let pageInfo = content?.timelineItems?.pageInfo;
    while (content?.timelineItems && pageInfo?.hasNextPage) {
      const more = await fetchMoreTimelineItems(content.id!, pageInfo.endCursor);
      content.timelineItems.nodes.push(...more.nodes);
      pageInfo = more.pageInfo;
    }
  }

  return {
    title: projectTitle,
    items: allItems,
  };
}

/**
 * Lightweight scan of every project item: only id/timestamps/content type, no
 * fieldValues or timeline. Used by the filtered sync's `probe` strategy to
 * decide which items actually need a detail refetch.
 */
interface ProjectItemRefsPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ProjectItemRefsItems {
  totalCount: number;
  pageInfo: ProjectItemRefsPageInfo;
  nodes: Array<GitHubProjectItemRef | null>;
}

interface ProjectItemRefsProject {
  title: string;
  items: ProjectItemRefsItems;
}

interface ProjectItemRefsOwner {
  projectV2?: ProjectItemRefsProject;
}

interface ProjectItemRefsResponse {
  errors?: unknown;
  data?: {
    organization?: ProjectItemRefsOwner;
    user?: ProjectItemRefsOwner;
  };
}

export async function fetchProjectItemRefs(
  ownerLogin: string,
  projectNumber: number,
  ownerType: "user" | "organization" = "user",
  onProgress?: (fetched: number, total: number | null) => void,
  shouldAbort?: () => Promise<boolean>
): Promise<GitHubProjectRefsData> {
  const ownerQuery =
    ownerType === "organization"
      ? `organization(login: "${ownerLogin}")`
      : `user(login: "${ownerLogin}")`;

  const query = `
    query GetProjectItemRefs($after: String, $first: Int!) {
      ${ownerQuery} {
        projectV2(number: ${projectNumber}) {
          title
          items(first: $first, after: $after) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              updatedAt
              isArchived
              content {
                __typename
                ... on Issue {
                  id
                  number
                  createdAt
                  updatedAt
                }
                ... on PullRequest {
                  id
                  number
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }
      }
    }
  `;

  const refs: GitHubProjectItemRef[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let total = 0;
  let projectTitle = "";
  const pageSize = 100;

  while (hasNextPage) {
    if (shouldAbort && (await shouldAbort())) {
      throw new SyncCancelledError();
    }

    const response: Response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ query, variables: { after: cursor, first: pageSize } }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${text}`);
    }

    const data = (await response.json()) as ProjectItemRefsResponse;
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors, null, 2)}`);
    }

    const owner = data.data?.[ownerType === "organization" ? "organization" : "user"];
    const project = owner?.projectV2;
    if (!project) {
      throw new Error(
        `Project #${projectNumber} not found for ${ownerLogin}. Make sure the project exists and token has access.`
      );
    }

    projectTitle = project.title || projectTitle;
    const items = project.items;
    if (typeof items.totalCount === "number") total = items.totalCount;
    for (const node of items.nodes || []) {
      if (node) refs.push(node as GitHubProjectItemRef);
    }
    onProgress?.(refs.length, total || null);

    hasNextPage = items.pageInfo.hasNextPage;
    cursor = items.pageInfo.endCursor;
  }

  return { title: projectTitle, total, refs };
}

/** Batch size for selective detail fetches; kept small so one response stays light. */
export const PROJECT_ITEM_DETAIL_BATCH_SIZE = 25;

/**
 * Fetch full details for a set of ProjectV2Item ids via `nodes(ids:)`. This is
 * used after the shallow scan so unchanged items never pay for fieldValues /
 * timeline payloads.
 */
export async function fetchProjectItemsByIds(
  ids: string[],
  onProgress?: (fetched: number, total: number) => void,
  shouldAbort?: () => Promise<boolean>
): Promise<GitHubProjectItem[]> {
  const query = `
    query GetProjectItemsByIds($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProjectV2Item {
          ${PROJECT_ITEM_DETAIL_FIELDS}
        }
      }
    }
  `;

  const items: GitHubProjectItem[] = [];

  for (let i = 0; i < ids.length; i += PROJECT_ITEM_DETAIL_BATCH_SIZE) {
    if (shouldAbort && (await shouldAbort())) {
      throw new SyncCancelledError();
    }

    const batch = ids.slice(i, i + PROJECT_ITEM_DETAIL_BATCH_SIZE);
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ query, variables: { ids: batch } }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors, null, 2)}`);
    }

    for (const node of data.data?.nodes || []) {
      if (node) items.push(node as GitHubProjectItem);
    }
    onProgress?.(items.length, ids.length);
  }

  return items;
}

/**
 * Fill in status-change history beyond the first 20 events for items fetched
 * selectively. The full-sync path keeps its own copy of this loop; this helper
 * is additive for the filtered path.
 */
export async function topUpProjectItemTimelines(
  items: GitHubProjectItem[],
  shouldAbort?: () => Promise<boolean>
): Promise<void> {
  for (const item of items) {
    if (shouldAbort && (await shouldAbort())) {
      throw new SyncCancelledError();
    }
    const content = item.content;
    let pageInfo = content?.timelineItems?.pageInfo;
    while (content?.timelineItems && pageInfo?.hasNextPage) {
      const more = await fetchMoreTimelineItems(content.id!, pageInfo.endCursor);
      content.timelineItems.nodes.push(...more.nodes);
      pageInfo = more.pageInfo;
    }
  }
}

async function fetchMoreTimelineItems(
  nodeId: string,
  after: string | null
): Promise<{
  nodes: Array<{ __typename: string; createdAt?: string; previousStatus?: string; status?: string }>;
  pageInfo?: { hasNextPage: boolean; endCursor: string | null };
}> {
  const query = `
    query GetMoreTimelineItems($id: ID!, $after: String) {
      node(id: $id) {
        ... on Issue {
          timelineItems(first: 100, after: $after, itemTypes: [PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]) {
            nodes {
              __typename
              ... on ProjectV2ItemStatusChangedEvent {
                createdAt
                previousStatus
                status
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        ... on PullRequest {
          timelineItems(first: 100, after: $after, itemTypes: [PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]) {
            nodes {
              __typename
              ... on ProjectV2ItemStatusChangedEvent {
                createdAt
                previousStatus
                status
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  `;

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ query, variables: { id: nodeId, after } }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors, null, 2)}`);
  }

  const timelineItems = data.data?.node?.timelineItems;
  return { nodes: timelineItems?.nodes || [], pageInfo: timelineItems?.pageInfo };
}

/**
 * Fetch the board's own "Status" column options straight from its field
 * definition, so a status shows up even if no task is currently sitting in
 * it (and never gets lost once every task has moved on from it) — unlike
 * deriving the list from tasks currently stored in the DB.
 */
export async function fetchProjectStatusOptions(
  ownerLogin: string,
  projectNumber: number,
  ownerType: "user" | "organization" = "user"
): Promise<string[]> {
  const ownerQuery =
    ownerType === "organization"
      ? `organization(login: "${ownerLogin}")`
      : `user(login: "${ownerLogin}")`;

  const query = `
    query GetStatusFieldOptions {
      ${ownerQuery} {
        projectV2(number: ${projectNumber}) {
          field(name: "Status") {
            ... on ProjectV2SingleSelectField {
              options {
                name
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors, null, 2)}`);
  }

  const owner = data.data?.[ownerType === "organization" ? "organization" : "user"];
  const options = owner?.projectV2?.field?.options as Array<{ name: string }> | undefined;
  return (options ?? []).map((o) => o.name);
}

/**
 * Parse status from GitHub Project field values
 */
export function parseStatusFromFieldValues(
  fieldValues: GitHubProjectItem["fieldValues"]
): string {
  for (const node of fieldValues.nodes) {
    if (
      node.__typename === "ProjectV2ItemFieldSingleSelectValue" &&
      node.field?.name?.toLowerCase() === "status"
    ) {
      return node.name || "Todo";
    }
  }
  return "Todo";
}

/**
 * Parse date from GitHub Project field values based on likely column names
 */
export function parseDateFromFieldValues(
  fieldValues: GitHubProjectItem["fieldValues"],
  fieldNameKeywords: string[]
): string | null {
  for (const node of fieldValues.nodes) {
    if (node.__typename === "ProjectV2ItemFieldDateValue" && node.field?.name) {
      const nameLower = node.field.name.toLowerCase();
      if (fieldNameKeywords.some((keyword) => nameLower.includes(keyword))) {
        return node.date || null;
      }
    }
  }
  return null;
}

/**
 * Parse number value from GitHub Project field values (e.g. Story Points)
 */
export function parseNumberFromFieldValues(
  fieldValues: GitHubProjectItem["fieldValues"],
  fieldNameKeywords: string[]
): number | null {
  for (const node of fieldValues.nodes) {
    if (node.__typename === "ProjectV2ItemFieldNumberValue" && node.field?.name) {
      const nameLower = node.field.name.toLowerCase();
      if (fieldNameKeywords.some((keyword) => nameLower.includes(keyword))) {
        return node.number ?? null;
      }
    }
  }
  return null;
}
