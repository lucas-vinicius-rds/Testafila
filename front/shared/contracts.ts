export type User = {
  id: string;
  name: string;
  email: string;
};

export type SessionResponse = {
  user: User;
} | null;

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  previewKey: string | null;
};

export type ProjectsResponse = {
  projects: ProjectSummary[];
};
