import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../views/AppLayout.vue'

// Four real routes so every section is linkable and bookmarkable; the shell is their parent.
const routes = [
  {
    path: '/',
    component: AppLayout,
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('../views/DashboardView.vue'),
        meta: { title: '看板', shareable: true },
      },
      {
        path: 'usage',
        name: 'usage',
        component: () => import('../views/UsageView.vue'),
        meta: { title: '用量明细', shareable: true },
      },
      {
        path: 'services',
        name: 'services',
        component: () => import('../views/ServicesView.vue'),
        meta: { title: '已订业务', shareable: true },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../views/SettingsView.vue'),
        meta: { title: '设置', shareable: false },
      },
      { path: ':pathMatch(.*)*', redirect: { name: 'dashboard' } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const section = to.meta?.title
  document.title = section ? `${section} · 联通套餐余量面板` : '联通套餐余量面板'
})

export default router
