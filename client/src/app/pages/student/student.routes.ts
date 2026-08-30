import { Routes } from '@angular/router';

export const STUDENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./student-home.component').then((m) => m.StudentHomeComponent),
  },
];
