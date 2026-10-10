export interface MemberItem {
  id: string;
  userId: string;
  email: string;
  role: "collaborator";
  joinedAt: string;
}

export interface MembersData {
  projectId: string;
  projectSlug: string;
  projectName: string;
  isOwner: boolean;
  owner: {
    id: string;
    email: string;
    role: "owner";
  };
  members: MemberItem[];
}
