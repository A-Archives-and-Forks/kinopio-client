import Vue from 'vue'
import Router from 'vue-router'

import Space from '@/views/Space.vue'
import store from '@/store/store.js'

Vue.use(Router)

export default new Router({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: [
    {
      path: '/',
      name: 'space',
      component: Space
    }, {
      path: '/beta',
      name: 'beta',
      component: Space,
      beforeEnter: (to, from, next) => {
        store.commit('isBeta', true)
        store.commit('addNotification', { message: 'No features currently in Beta' }) // 'No features currently in Beta'
        next()
      }
    }, {
      path: '/confirm-email',
      name: 'confirm-email',
      component: Space,
      redirect: to => {
        store.dispatch('currentUser/confirmEmail')
        store.commit('addNotification', { message: 'Email Confirmed', type: 'success' })
        return '/'
      }
    }, {
      path: '/reset-password',
      name: 'reset-password',
      component: Space,
      beforeEnter: (to, from, next) => {
        const urlParams = new URLSearchParams(window.location.search)
        const apiKey = urlParams.get('apiKey')
        if (apiKey) {
          store.commit('resetPasswordApiKey', apiKey)
          store.commit('passwordResetIsVisible', true)
        }
        next()
        window.history.replaceState({}, document.title, window.location.origin)
      }
    }, {
      path: '/update-arena-access-token',
      name: 'update-arena-access-token',
      component: Space,
      beforeEnter: (to, from, next) => {
        const urlParams = new URLSearchParams(window.location.search)
        const arenaReturnedCode = urlParams.get('code')
        next()
        window.history.replaceState({}, document.title, window.location.origin)
        store.dispatch('currentUser/updateArenaAccessToken', arenaReturnedCode)
      }
    }, {
      path: '/invite',
      name: 'invite',
      component: Space,
      beforeEnter: (to, from, next) => {
        store.dispatch('currentUser/init')
        const urlParams = new URLSearchParams(window.location.search)
        const spaceId = urlParams.get('spaceId')
        const collaboratorKey = urlParams.get('collaboratorKey')
        if (!spaceId || !collaboratorKey) { return }
        console.log('🌸🌸🌸🌸🌸🌸', spaceId, collaboratorKey)
        // temp: wont call if not signed in
        store.dispatch('api/addSpaceCollaborator', { spaceId, collaboratorKey }).then(response => {
          // the above state is not available here, since it
          // it is resolved asynchronously in the store action
          console.log('🍆', response)
        })
        // , error => {
        // handle error here
        // })
        next()
      }

    }, {
      path: '/:space',
      component: Space,
      beforeEnter: (to, from, next) => {
        const spaceUrl = window.location.pathname.substring(1) // "/space-id" -> "space-id"
        store.commit('spaceUrlToLoad', spaceUrl)
        next()
      }
    }
    // {
    //   path: '/legal',
    //   name: 'legal',
    //   // route level code-splitting
    //   // this generates a separate chunk (about.[hash].js) for this route
    //   // which is lazy-loaded when the route is visited.
    //   component: () => import(/* webpackChunkName: "legal" */ './views/Legal.vue')
    // }
  ]
})
