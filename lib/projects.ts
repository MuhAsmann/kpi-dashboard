// GitHub Projects V2 boards this dashboard syncs and lets you filter by.
// Add/remove entries here to change which boards are tracked.
export interface ProjectConfig {
    number: number;
    label: string;
}

export const PROJECTS: ProjectConfig[] = [
    { number: 21, label: "mobile" },
    { number: 9, label: "be-alwin" },
    { number: 8, label: "fe" },
];
