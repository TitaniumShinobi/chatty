import { z } from "zod";

export const P_HELLO = z.object({ userNameId: z.number() });
export const P_FILE_UP = z.object({ nameId: z.number(), typeId: z.number(), bytes: z.number() });
export const P_IDLE = z.object({ minutes: z.number() });
export const P_QA = z.object({ topicId: z.number() });
export const P_CODE = z.object({ langId: z.number(), taskId: z.number() });
export const P_SUM = z.object({ docNameId: z.number() });
export const P_AUTH = z.object({ displayNameId: z.number(), avatarUrlId: z.number() });
export const P_ERR = z.object({ code: z.number() });
