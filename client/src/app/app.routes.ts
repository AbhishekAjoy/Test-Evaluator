import { Routes } from '@angular/router';
import { authGuard } from '../guards/auth.guard';
import { roleGuard } from '../guards/role.guard';
import { homeRedirectGuard } from '../guards/home-redirect.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
    loadChildren: () => import('./pages/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: 'teacher',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
    loadChildren: () => import('./pages/teacher/teacher.routes').then((m) => m.TEACHER_ROUTES),
  },
  {
    path: 'student',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
    loadChildren: () => import('./pages/student/student.routes').then((m) => m.STUDENT_ROUTES),
  },
  // Never actually renders - always resolves to a redirect (login, or the caller's own
  // role home), so a bare "/" or a mistyped URL lands somewhere sane either way.
  { path: '', canActivate: [homeRedirectGuard], children: [] },
  { path: '**', redirectTo: '' },
];
