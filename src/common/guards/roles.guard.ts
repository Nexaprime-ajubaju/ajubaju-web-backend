import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/schemas/user.schema';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      'roles',
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // Golo_admin_backend compatibility: allow SUPER_ADMIN and MANAGER to access ADMIN routes
    if (requiredRoles.includes(UserRole.ADMIN)) {
      if (
        user.role === UserRole.ADMIN ||
        user.adminType === 'SUPER_ADMIN' ||
        user.adminType === 'MANAGER'
      ) {
        return true;
      }
    }

    return requiredRoles.includes(user.role);
  }
}
