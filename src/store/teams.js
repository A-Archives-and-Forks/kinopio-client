import utils from '@/utils.js'

import uniqBy from 'lodash-es/uniqBy'
import uniq from 'lodash-es/uniq'

// normalized state
// https://github.com/vuejs/vuejs.org/issues/1636

export default {
  namespaced: true,
  state: {
    ids: [],
    teams: {} // {id, {team}}
  },
  mutations: {

    // init

    clear: (state) => {
      state.ids = []
      state.teams = {}
    },
    restore: (state, teams) => {
      let teamIds = []
      teams.forEach(team => {
        teamIds.push(team.id)
        state.teams[team.id] = team
      })
      state.ids = state.ids.concat(teamIds)
      console.log('👫 teams', state.teams)
    },

    // create

    create: (state, team) => {
      utils.typeCheck({ value: team, type: 'object' })
      state.teams[team.id] = team
      state.ids.push(team.id)
      console.log('👫 teams', state.teams)
    },

    // update

    update: (state, team) => {
      if (!team.id) {
        console.warn('🚑 could not update team', team)
        return
      }
      const prevGroup = state.teams[team.id]
      if (prevGroup) {
        const keys = Object.keys(team)
        let updatedGroup = utils.clone(prevGroup)
        keys.forEach(key => {
          updatedGroup[key] = team[key]
        })
        state.teams[team.id] = updatedGroup
      } else {
        state.ids.push(team.id)
        state.teams[team.id] = team
      }
    }
  },
  actions: {
    createGroup: async (context, team) => {
      try {
        const response = await context.dispatch('api/createGroup', team, { root: true })
        let newGroup = response.team
        let teamUser = response.teamUser
        teamUser.id = teamUser.userId
        newGroup.teamUser = teamUser
        newGroup.users = [response.teamUser]
        context.commit('create', newGroup)
      } catch (error) {
        console.error('🚒 createGroup', error, team)
      }
    },
    loadGroup: async (context, space) => {
      context.commit('currentSpace/updateGroupMeta', space, { root: true })
      let team = space.team
      if (!team) { return }
      context.commit('update', team)
      const teamUser = context.getters.teamUser({ userId: context.rootState.currentUser.id })
      if (!teamUser) { return }
      try {
        team = await context.dispatch('api/getGroup', team.id, { root: true })
        context.commit('update', team)
      } catch (error) {
        console.error('🚒 loadGroup', error, team)
      }
    },
    joinGroup: async (context) => {
      const userId = context.rootState.currentUser.id
      const team = context.rootState.teamToJoinOnLoad
      if (!team) { return }
      context.commit('notifyIsJoiningGroup', true, { root: true })
      try {
        const response = await context.dispatch('api/createGroupUser', {
          teamId: team.teamId,
          collaboratorKey: team.collaboratorKey,
          userId
        }, { root: true })
        context.commit('addNotification', {
          badge: 'Joined Group',
          message: `${response.team.name}`,
          type: 'success',
          isPersistentItem: true,
          team: response.team
        }, { root: true })
        context.commit('triggerSpaceDetailsVisible', null, { root: true })
      } catch (error) {
        console.error('🚒 joinGroup', error)
        context.commit('addNotification', {
          message: `Failed to Join Group`,
          type: 'danger',
          icon: 'team',
          isPersistentItem: true
        }, { root: true })
      }
      context.commit('notifyIsJoiningGroup', false, { root: true })
      context.commit('teamToJoinOnLoad', null, { root: true })
    },
    update: (context, team) => {
      context.commit('update', team)
      context.dispatch('api/addToQueue', { name: 'updateGroup', body: team }, { root: true })
    },
    updateUserRole: (context, update) => {
      const { userId, teamId, role } = update
      let team = context.getters.byId(teamId)
      team = utils.clone(team)
      team.users = team.users.map(user => {
        if (user.id === userId) {
          user.role = role
        }
        return user
      })
      context.commit('update', team)
      context.dispatch('api/addToQueue', { name: 'updateGroupUser', body: update }, { root: true })
    },
    addCurrentSpace: (context, team) => {
      const user = context.rootState.currentUser
      context.dispatch('currentSpace/updateSpace', { teamId: team.id, addedToGroupByUserId: user.id }, { root: true })
    },
    removeCurrentSpace: (context) => {
      context.dispatch('currentSpace/updateSpace', { teamId: null, addedToGroupByUserId: null }, { root: true })
    },
    removeGroupUser: (context, { teamId, userId }) => {
      let team = context.getters.byId(teamId)
      team = utils.clone(team)
      team.users = team.users.filter(user => user.id !== userId)
      const updatedGroup = {
        id: team.id,
        users: team.users
      }
      context.commit('update', updatedGroup)
    },
    updateOtherGroups: async (context, otherGroup) => {
      let team = context.getters.byId(otherGroup.id)
      if (team) { return }
      team = await context.dispatch('api/getGroup', otherGroup.id, { root: true })
      context.commit('create', team)
    }
  },
  getters: {
    byId: (state) => (id) => {
      return state.teams[id]
    },
    all: (state) => {
      return state.ids.map(id => state.teams[id])
    },
    byUser: (state, getters, rootState) => (user) => {
      user = user || rootState.currentUser
      const teams = getters.all
      let teamUserGroups = teams.filter(team => {
        return team.users.find(teamUser => {
          const teamUserId = teamUser.id || teamUser.userId
          return teamUserId === user.id
        })
      })
      teamUserGroups = uniqBy(teamUserGroups, 'id')
      return teamUserGroups
    },
    spaceGroup: (state, getters, rootState) => (space) => {
      const currentSpace = rootState.currentSpace
      space = space || currentSpace
      return state.teams[space.teamId]
    },
    teamUser: (state, getters, rootState) => ({ userId, space, teamId }) => {
      let team
      if (teamId) {
        team = getters.byId(teamId)
      } else {
        const currentSpace = rootState.currentSpace
        space = space || currentSpace
        team = getters.spaceGroup(space)
      }
      if (!team) { return }
      return team.users.find(user => user.id === userId)
    },
    currentUserIsCurrentSpaceGroupUser: (state, getters, rootState) => {
      const userId = rootState.currentUser.id
      const teamId = rootState.currentSpace.teamId
      if (!teamId) { return }
      const team = getters.spaceGroup()
      return team.users.find(user => user.id === userId)
    },
    teamUserIsAdmin: (state, getters, rootState) => ({ userId, space, teamId }) => {
      let teamUser
      if (teamId) {
        const team = getters.byId(teamId)
        teamUser = team.users.find(user => user.id === userId)
      } else {
        teamUser = getters.teamUser({ userId, space })
      }
      return teamUser?.role === 'admin'
    },
    bySpaces: (state, getters, rootState) => (spaces) => {
      let teamIds = spaces.map(space => space.teamId)
      teamIds = teamIds.filter(id => Boolean(id))
      teamIds = uniq(teamIds)
      const teams = teamIds.map(id => getters.byId(id))
      return teams
    }
  }
}
