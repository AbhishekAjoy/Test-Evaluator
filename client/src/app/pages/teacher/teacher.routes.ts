import { Routes } from '@angular/router';

export const TEACHER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./teacher-home.component').then((m) => m.TeacherHomeComponent),
  },
];
