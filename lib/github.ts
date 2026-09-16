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
 * Fetch GitHub Project V2 items using GraphQL API
 */
export async function fetchGitHubProjectItems(
  ownerLogin: string,
  projectNumber: number,
  ownerType: "user" | "organization" = "user"
): Promise<GitHubProjectData> {
  const ownerQuery =
    ownerType === "organization"
      ? `organization(login: "${ownerLogin}")`
      : `user(login: "${ownerLogin}")`;

  const query = `
    query GetProjectItems($after: String) {
      ${ownerQuery} {
        projectV2(number: ${projectNumber}) {
          title
          items(first: 100, after: $after) {
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

  while (hasNextPage) {
    const variables: Record<string, string | null> = { after: cursor };

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

    allItems = [...allItems, ...(items.nodes || [])];

    hasNextPage = items.pageInfo.hasNextPage;
    cursor = items.pageInfo.endCursor;
  }

  // Status-change history is capped at 20 per item above; fetch the rest for
  // any item that hit that cap, so heavy-churn tickets don't lose history.
  for (const item of allItems) {
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
