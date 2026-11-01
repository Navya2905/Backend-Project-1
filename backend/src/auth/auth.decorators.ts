import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthenticatedRequest = Request & { user: AuthUser };

// Marks a route as reachable without a login token.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Injects the logged-in user (set by JwtAuthGuard) into a controller method.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
