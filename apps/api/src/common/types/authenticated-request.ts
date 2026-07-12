import { LoginMethod } from "@1toufang/database/client";

export type AuthenticatedUser = {
  id: string;
  email: string;
  method: LoginMethod;
  teamId?: string;
  roleId?: string | null;
  employeeNo?: string;
};

export type AuthenticatedRequest = {
  user: AuthenticatedUser;
};
