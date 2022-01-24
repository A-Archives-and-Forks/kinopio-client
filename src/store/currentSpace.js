import helloSpace from '@/data/hello.json'
import newSpace from '@/data/new.json'

import words from '@/data/words.js'
import moonphase from '@/moonphase.js'
import utils from '@/utils.js'
import cache from '@/cache.js'

import { nextTick } from 'vue'
import randomColor from 'randomcolor'
import nanoid from 'nanoid'
import random from 'lodash-es/random'
import uniqBy from 'lodash-es/uniqBy'
import uniq from 'lodash-es/uniq'
import sortBy from 'lodash-es/sortBy'
import defer from 'lodash-es/defer'
import dayjs from 'dayjs'

let otherSpacesQueue = [] // id
let spectatorIdleTimers = []
let notifiedCardAdded = []
let isLoadingRemoteSpace

export default {
  namespaced: true,
  state: utils.clone(helloSpace),
  mutations: {

    restoreSpace: (state, space) => {
      space = utils.removeRemovedCardsFromSpace(space)
      Object.assign(state, space)
    },

    // Users

    addUserToSpace: (state, newUser) => {
      utils.typeCheck({ value: newUser, type: 'object', origin: 'addUserToSpace' })
      const userExists = state.users.find(user => user.id === newUser.id)
      if (userExists) { return }
      state.users.push(newUser)
      cache.updateSpace('users', state.users, state.id)
    },
    addCollaboratorToSpace: (state, newUser) => {
      utils.typeCheck({ value: newUser, type: 'object', origin: 'addCollaboratorToSpace' })
      const collaboratorExists = state.collaborators.find(collaborator => collaborator.id === newUser.id)
      if (collaboratorExists) { return }
      state.collaborators.push(newUser)
      const space = utils.clone(state)
      cache.saveSpace(space)
      cache.updateSpace('collaborators', space.collaborators, space.id)
    },
    addSpectatorToSpace: (state, newUser) => {
      state.spectators.push(newUser)
      state.spectators = uniqBy(state.spectators, 'id')
    },
    updateSpaceClients: (state, updates) => {
      utils.typeCheck({ value: updates, type: 'array', origin: 'updateSpaceClients' })
      state.clients = state.clients.concat(updates)
    },
    removeClientsFromSpace: (state) => {
      state.clients = []
    },
    removeSpectatorFromSpace: (state, oldUser) => {
      utils.typeCheck({ value: oldUser, type: 'object', origin: 'removeSpectatorFromSpace' })
      if (!state.spectators) { return }
      state.spectators = state.spectators.filter(user => {
        return user.id !== oldUser.id
      })
    },
    removeUserFromSpace: (state, oldUser) => {
      utils.typeCheck({ value: oldUser, type: 'object', origin: 'removeUserFromSpace' })
      state.users = state.users.filter(user => {
        return user.id !== oldUser.id
      })
      cache.updateSpace('users', state.users, state.id)
    },
    removeCollaboratorFromSpace: (state, oldUser) => {
      utils.typeCheck({ value: oldUser, type: 'object', origin: 'removeCollaboratorFromSpace' })
      state.collaborators = state.collaborators.filter(user => {
        return user.id !== oldUser.id
      })
      cache.updateSpace('collaborators', state.collaborators, state.id)
    },
    // websocket receive
    updateUser: (state, updatedUser) => {
      state.users = utils.updateUsersWithUser(state.users, updatedUser)
    },
    // websocket receive
    updateCollaborator: (state, updatedUser) => {
      state.collaborators = utils.updateUsersWithUser(state.collaborators, updatedUser)
    },
    // websocket receive
    updateSpectator: (state, updatedUser) => {
      state.spectators = utils.updateUsersWithUser(state.spectators, updatedUser)
    },

    // Space

    updateSpace: (state, updatedSpace) => {
      const updates = Object.keys(updatedSpace)
      updates.forEach(key => {
        state[key] = updatedSpace[key]
        cache.updateSpace(key, state[key], state.id)
      })
    },

    // Tags

    addTag: (state, tag) => {
      state.tags.push(tag)
      cache.updateSpace('tags', state.tags, state.id)
    },
    removeTag: (state, tag) => {
      state.tags = state.tags.filter(spaceTag => spaceTag.id !== tag.id)
      cache.updateSpace('tags', state.tags, state.id)
    },
    removeTags: (state, tag) => {
      state.tags = state.tags.filter(spaceTag => spaceTag.name !== tag.name)
      cache.removeTagsByNameInAllSpaces(tag)
    },
    removeTagsFromCard: (state, card) => {
      state.tags = state.tags.filter(spaceTag => {
        return spaceTag.cardId !== card.id
      })
      cache.updateSpace('tags', state.tags, state.id)
    },
    deleteTagsFromAllRemovedCardsPermanent: (state) => {
      const cardIds = state.removedCards.map(card => card.id)
      state.tags = state.tags.filter(spaceTag => {
        return !cardIds.includes(spaceTag.cardId)
      })
      cache.updateSpace('tags', state.tags, state.id)
    },
    updateTagNameColor: (state, updatedTag) => {
      state.tags = state.tags.map(tag => {
        if (tag.name === updatedTag.name) {
          tag.color = updatedTag.color
        }
        return tag
      })
      cache.updateTagColorInAllSpaces(updatedTag)
    }
  },

  actions: {
    init: async (context) => {
      const spaceUrl = context.rootState.spaceUrlToLoad
      const loadJournalSpace = context.rootState.loadJournalSpace
      const loadNewSpace = context.rootState.loadNewSpace
      const user = context.rootState.currentUser
      let isRemote
      // restore from url
      if (spaceUrl) {
        console.log('🚃 Restore space from url', spaceUrl)
        const spaceId = utils.spaceIdFromUrl(spaceUrl)
        const space = { id: spaceId }
        isRemote = true
        await context.dispatch('loadSpace', { space })
      // restore or create journal space
      } else if (loadJournalSpace) {
        console.log('🚃 Restore journal space')
        await context.dispatch('loadJournalSpace')
      // create new space
      } else if (loadNewSpace) {
        console.log('🚃 Create new space')
        await context.dispatch('addSpace')
        context.commit('loadNewSpace', false, { root: true })
      // restore last space
      } else if (user.lastSpaceId) {
        console.log('🚃 Restore last space', user.lastSpaceId)
        await context.dispatch('loadLastSpace')
      // hello kinopio
      } else {
        console.log('🚃 Create new Hello Kinopio space')
        await context.dispatch('createNewHelloSpace')
        context.dispatch('updateUserLastSpaceId')
      }
      context.dispatch('updateModulesSpaceId')
      context.commit('triggerUpdateWindowHistory', { isRemote }, { root: true })
      const currentUserIsSignedIn = context.rootGetters['currentUser/isSignedIn']
      const shouldShow = context.rootState.currentUser.shouldShowNewUserNotification
      if (!currentUserIsSignedIn && shouldShow) {
        context.commit('notifyNewUser', true, { root: true })
      } else {
        context.commit('notifyNewUser', false, { root: true })
      }
    },

    // Users and otherSpaces

    updateUserPresence: (context, update) => {
      utils.typeCheck({ value: update, type: 'object', origin: 'updateUserPresence' })
      const newUser = update.user || update
      const member = context.getters.memberById(newUser.id)
      if (member) {
        context.commit('updateSpaceClients', [newUser])
      } else {
        context.commit('addSpectatorToSpace', newUser)
        clearTimeout(spectatorIdleTimers[newUser.id])
        const removeIdleSpectator = (newUser) => {
          context.commit('removeSpectatorFromSpace', newUser)
        }
        spectatorIdleTimers[newUser.id] = setTimeout(() => {
          removeIdleSpectator(newUser)
        }, 60 * 1000) // 60 seconds
      }
    },
    addUserToJoinedSpace: (context, newUser) => {
      if (newUser.isCollaborator) {
        context.commit('addCollaboratorToSpace', newUser)
        context.commit('removeSpectatorFromSpace', newUser)
      } else {
        context.dispatch('updateUserPresence', newUser)
      }
    },
    updateOtherUsers: async (context) => {
      const cards = utils.clone(context.rootGetters['currentCards/all'])
      let userIds = []
      const spaceMemberIds = utils.clone(context.state.users).map(user => user.id)
      const spaceCollaboratorIds = utils.clone(context.state.collaborators).map(user => user.id)
      userIds = userIds.concat(spaceMemberIds)
      userIds = userIds.concat(spaceCollaboratorIds)
      let otherUserIds = []
      cards.forEach(card => {
        if (!card.nameUpdatedByUserId) { return }
        if (!userIds.includes(card.nameUpdatedByUserId)) {
          otherUserIds.push(card.nameUpdatedByUserId)
        }
      })
      otherUserIds = uniq(otherUserIds)
      if (!otherUserIds.length) { return }
      const users = await context.dispatch('api/getPublicUsers', otherUserIds, { root: true })
      users.forEach(user => {
        context.commit('updateOtherUsers', user, { root: true })
      })
    },
    updateOtherSpaces: async (context, spaceId) => {
      const canEditSpace = context.rootGetters['currentUser/canEditSpace']()
      let links
      if (spaceId) {
        links = [{ linkToSpaceId: spaceId }]
      } else {
        links = context.rootGetters['currentCards/withSpaceLinks']
      }
      if (!links.length) { return }
      links.forEach(link => {
        const spaceId = link.linkToSpaceId
        context.dispatch('saveOtherSpace', { spaceId, shouldAddToQueue: true })
      })
      otherSpacesQueue = uniq(otherSpacesQueue)
      let spaces = await context.dispatch('api/getSpaces', { spaceIds: otherSpacesQueue, shouldRequestRemote: true }, { root: true })
      if (!spaces) { return }
      spaces = spaces.filter(space => space.id)
      spaces.forEach(space => {
        space = utils.normalizeSpaceMetaOnly(space)
        context.commit('updateOtherSpaces', space, { root: true })
        const linkedCard = links.find(link => link.linkToSpaceId === space.id)
        if (!linkedCard) { return }
        nextTick(() => {
          context.dispatch('currentConnections/updatePaths', { cardId: linkedCard.id, shouldUpdateApi: canEditSpace }, { root: true })
        })
      })
      otherSpacesQueue = []
    },
    saveOtherSpace: async (context, { spaceId, shouldAddToQueue }) => {
      const cachedSpace = cache.space(spaceId)
      const spaceIsCached = Boolean(cachedSpace.id)
      if (spaceIsCached) {
        const space = utils.normalizeSpaceMetaOnly(cachedSpace)
        context.commit('updateOtherSpaces', space, { root: true })
      } else if (shouldAddToQueue) {
        otherSpacesQueue.push(spaceId)
      } else {
        try {
          const space = { id: spaceId }
          let remoteSpace = await context.dispatch('api/getSpace', { space, shouldRequestRemote: true }, { root: true })
          remoteSpace = utils.normalizeSpaceMetaOnly(remoteSpace)
          context.commit('updateOtherSpaces', remoteSpace, { root: true })
        } catch (error) {
          console.warn('🚑 otherSpace not found', error, spaceId)
        }
      }
    },

    // Space

    createNewHelloSpace: (context) => {
      const user = context.rootState.currentUser
      let space = utils.clone(helloSpace)
      space.id = nanoid()
      space = cache.updateIdsInSpace(space)
      context.commit('clearSearch', null, { root: true })
      context.dispatch('restoreSpaceInChunks', { space })
      context.commit('addUserToSpace', user)
      context.dispatch('updateOtherUsers')
      context.dispatch('updateOtherSpaces')
    },
    createNewSpace: (context) => {
      window.scrollTo(0, 0)
      let space = utils.clone(newSpace)
      space.name = words.randomUniqueName()
      space.id = nanoid()
      const newSpacesAreBlank = context.rootState.currentUser.newSpacesAreBlank
      if (newSpacesAreBlank) {
        space.connectionTypes = []
        space.connections = []
        space.cards = []
      } else {
        space.connectionTypes[0].color = randomColor({ luminosity: 'light' })
        space.cards[1].x = random(180, 200)
        space.cards[1].y = random(180, 200)
      }
      space.userId = context.rootState.currentUser.id
      space = utils.spaceDefaultBackground(space, context.rootState.currentUser)
      const nullCardUsers = true
      const uniqueNewSpace = cache.updateIdsInSpace(space, nullCardUsers)
      context.commit('clearSearch', null, { root: true })
      isLoadingRemoteSpace = false
      context.dispatch('restoreSpaceInChunks', { space: uniqueNewSpace })
      context.dispatch('loadBackground')
    },
    createNewJournalSpace: (context) => {
      // name
      let date = dayjs(new Date())
      if (context.rootState.loadJournalSpaceTomorrow) {
        date = date.add(1, 'day')
      }
      const moonPhase = moonphase(date)
      const day = `${moonPhase.emoji} ${date.format('dddd')}` // 🌘 Tuesday
      // meta
      const spaceId = nanoid()
      let space = utils.emptySpace(spaceId)
      space.name = utils.journalSpaceName(context.rootState.loadJournalSpaceTomorrow)
      space.privacy = 'private'
      space.moonPhase = moonPhase.name
      space.removedCards = []
      space.userId = context.rootState.currentUser.id
      space.connectionTypes = []
      space.connections = []
      space = utils.spaceDefaultBackground(space, context.rootState.currentUser)
      // cards
      space.cards.push({ id: nanoid(), name: day, x: 60, y: 100, frameId: 0 })
      const userPrompts = context.rootState.currentUser.journalPrompts
      userPrompts.forEach(prompt => {
        if (!prompt.name) { return }
        let card = { id: nanoid() }
        if (prompt.packId) {
          const pack = context.rootGetters['currentUser/packById'](prompt.packId)
          const randomPrompt = utils.randomPrompt(pack)
          const tag = utils.packTag(pack, card.id, space)
          if (tag) { space.tags.push(tag) }
          card.name = `[[${prompt.name}]] ${randomPrompt}`
        } else {
          card.name = prompt.name
        }
        const position = utils.promptCardPosition(space.cards, card.name)
        card.x = position.x
        card.y = position.y
        card.z = 0
        card.spaceId = spaceId
        space.cards.push(card)
      })
      context.commit('clearSearch', null, { root: true })
      isLoadingRemoteSpace = false
      context.dispatch('restoreSpaceInChunks', { space })
      context.dispatch('loadBackground')
    },
    saveNewSpace: (context) => {
      const space = utils.clone(context.state)
      const user = context.rootState.currentUser
      console.log('✨ saveNewSpace', space, user)
      cache.saveSpace(space)
      context.dispatch('api/addToQueue', {
        name: 'createSpace',
        body: space
      }, { root: true })
      context.commit('addUserToSpace', user)
      nextTick(() => {
        context.dispatch('currentCards/updateDimensions', null, { root: true })
      })
      context.dispatch('updateModulesSpaceId', space)
    },
    saveImportedSpace: async (context) => {
      context.commit('isLoadingSpace', true, { root: true })
      const space = utils.clone(context.state)
      const user = context.rootState.currentUser
      const currentUserIsSignedIn = context.rootGetters['currentUser/isSignedIn']
      cache.saveSpace(space)
      if (currentUserIsSignedIn) {
        await context.dispatch('api/createSpace', space, { root: true })
      }
      context.commit('triggerUpdateWindowHistory', { space, isRemote: currentUserIsSignedIn }, { root: true })
      context.commit('addUserToSpace', user)
      context.dispatch('loadBackground')
      context.dispatch('updateModulesSpaceId', space)
      nextTick(() => {
        context.dispatch('currentCards/updateDimensions', null, { root: true })
        context.commit('isLoadingSpace', false, { root: true })
      })
      context.commit('triggerUpdateCardOverlaps', null, { root: true })
      context.dispatch('incrementCardsCreatedCountFromSpace', space)
    },
    duplicateSpace: async (context) => {
      let space = cache.space(context.state.id)
      const user = context.rootState.currentUser
      context.commit('broadcast/leaveSpaceRoom', { user, type: 'userLeftRoom' }, { root: true })
      context.commit('clearSearch', null, { root: true })
      space = utils.clearSpaceMeta(space, 'copy')
      const nullCardUsers = true
      const uniqueNewSpace = cache.updateIdsInSpace(space, nullCardUsers)
      isLoadingRemoteSpace = false
      context.dispatch('loadSpace', { space: uniqueNewSpace, isLocalSpaceOnly: true })
      await context.dispatch('saveImportedSpace')
    },
    addSpace: (context) => {
      const user = context.rootState.currentUser
      context.commit('broadcast/leaveSpaceRoom', { user, type: 'userLeftRoom' }, { root: true })
      context.dispatch('createNewSpace')
      const cards = context.rootGetters['currentCards/all']
      if (cards.length) {
        context.dispatch('currentConnections/updatePaths', { cardId: cards[1].id, connections: context.rootGetters['currentConnections/all'] }, { root: true })
      }
      context.dispatch('saveNewSpace')
      context.dispatch('updateUserLastSpaceId')
      context.commit('notifyNewUser', false, { root: true })
      context.commit('notifySignUpToEditSpace', false, { root: true })
      context.commit('triggerUpdateWindowHistory', {}, { root: true })
    },
    addJournalSpace: (context) => {
      const user = context.rootState.currentUser
      context.commit('broadcast/leaveSpaceRoom', { user, type: 'userLeftRoom' }, { root: true })
      context.dispatch('createNewJournalSpace')
      context.dispatch('saveNewSpace')
      context.dispatch('updateUserLastSpaceId')
      context.commit('notifyNewUser', false, { root: true })
      context.commit('notifySignUpToEditSpace', false, { root: true })
      context.commit('triggerUpdateWindowHistory', {}, { root: true })
    },
    getRemoteSpace: async (context, space) => {
      const collaboratorKey = context.rootState.spaceCollaboratorKeys.find(key => key.spaceId === space.id)
      const currentUserIsSignedIn = context.rootGetters['currentUser/isSignedIn']
      const user = context.rootState.currentUser
      const currentSpaceIsRemote = utils.currentSpaceIsRemote(space, user)
      let remoteSpace
      try {
        if (currentUserIsSignedIn) {
          remoteSpace = await context.dispatch('api/getSpace', { space }, { root: true })
        } else if (collaboratorKey) {
          space.collaboratorKey = collaboratorKey
          remoteSpace = await context.dispatch('api/getSpaceAnonymously', space, { root: true })
          cache.saveInvitedSpace(remoteSpace)
          context.commit('collaboratorKey', '', { root: true })
        } else if (currentSpaceIsRemote) {
          remoteSpace = await context.dispatch('api/getSpaceAnonymously', space, { root: true })
        }
      } catch (error) {
        console.warn('🚑', error.status, error)
        if (error.status === 404) {
          context.commit('notifySpaceNotFound', true, { root: true })
          context.dispatch('loadLastSpace')
        }
        if (error.status === 401) {
          context.commit('notifySpaceNotFound', true, { root: true })
          context.dispatch('removeLocalSpaceIfUserIsRemoved', space)
          context.dispatch('loadLastSpace')
          cache.removeInvitedSpace(space)
        }
        if (error.status === 500) {
          context.commit('notifyConnectionError', true, { root: true })
        }
      }
      if (!remoteSpace) { return }
      // only restore current space
      if (remoteSpace.id !== context.state.id) { return }
      // only cache spaces you can edit
      const isSpaceMember = context.rootGetters['currentUser/isSpaceMember'](remoteSpace)
      const canEditSpace = context.rootGetters['currentUser/canEditSpace'](remoteSpace)
      if (isSpaceMember && !remoteSpace.isRemoved) {
        cache.saveSpace(remoteSpace)
      } else if (!isSpaceMember && canEditSpace) {
        context.commit('addNotification', { message: 'This space is open, which means you can add to it too', icon: 'open', type: 'success' }, { root: true })
      }
      return utils.normalizeRemoteSpace(remoteSpace)
    },
    removeLocalSpaceIfUserIsRemoved: (context, space) => {
      const cachedSpace = cache.space(space.id)
      const currentUserIsRemovedFromSpace = utils.objectHasKeys(cachedSpace)
      context.dispatch('currentUser/removeFavorite', { type: 'space', item: space }, { root: true })
      if (currentUserIsRemovedFromSpace) {
        context.commit('currentUser/resetLastSpaceId', null, { root: true })
        cache.deleteSpace(space)
        const emptySpace = utils.emptySpace(space.id)
        context.commit('restoreSpace', emptySpace)
      }
    },
    removeCurrentUserFromSpace: (context) => {
      const spaceIdToRemove = context.state.id
      const name = context.state.name
      const space = { id: spaceIdToRemove }
      context.dispatch('loadLastSpace')
      cache.removeSpace(space)
      context.commit('addNotification', { message: `You were removed as a collaborator from ${name}`, type: 'info' }, { root: true })
    },
    updateSpacePageSize: (context) => {
      nextTick(() => {
        context.commit('updateSpacePageSize', null, { root: true })
      })
    },
    removeEmptyCards: (context) => {
      let cards = context.rootGetters['currentCards/all']
      cards.forEach(card => {
        if (!card.name) {
          context.dispatch('currentCards/remove', card, { root: true })
        }
      })
    },
    loadJournalSpace: async (context) => {
      const spaces = cache.getAllSpaces()
      const journalName = utils.journalSpaceName(context.rootState.loadJournalSpaceTomorrow)
      const journalSpace = spaces.find(space => space.name === journalName)
      if (journalSpace) {
        const space = { id: journalSpace.id }
        context.dispatch('changeSpace', { space })
      } else {
        context.dispatch('addJournalSpace')
      }
      context.commit('loadJournalSpace', false, { root: true })
      context.commit('loadJournalSpaceTomorrow', false, { root: true })
    },
    updateModulesSpaceId: (context, space) => {
      space = space || context.state
      console.log('💕 update modules space id', space.id)
      context.dispatch('currentCards/updateSpaceId', space.id, { root: true })
      context.dispatch('currentConnections/updateSpaceId', space.id, { root: true })
    },
    restoreSpaceInChunks: (context, { space, isRemote, addCards, addConnections, addConnectionTypes }) => {
      if (!utils.objectHasKeys(space)) { return }
      console.log('🌱 Restoring space', space, { 'isRemote': isRemote, addCards, addConnections, addConnectionTypes })
      const chunkSize = 50
      const timeStart = utils.normalizeToUnixTime(new Date())
      const origin = { x: window.scrollX, y: window.scrollY }
      // init items
      let cards = addCards || space.cards || []
      let connectionTypes = addConnectionTypes || space.connectionTypes || []
      connectionTypes = connectionTypes.filter(type => Boolean(type))
      let connections = addConnections || space.connections || []
      cards = utils.normalizeItems(cards)
      connections = utils.normalizeItems(connections)
      // sort cards
      const cardIds = Object.keys(cards)
      cards = cardIds.map(id => {
        const card = cards[id]
        card.distanceFromOrigin = utils.distanceBetweenTwoPoints(card, origin)
        return card
      })
      cards = sortBy(cards, ['distanceFromOrigin'])
      // sort connections
      const connectionIds = Object.keys(connections)
      connections = connectionIds.map(id => {
        const connection = connections[id]
        if (connection.path) {
          const coords = utils.coordsFromConnectionPath(connection.path)
          connection.distanceFromOrigin = utils.distanceBetweenTwoPoints(coords, origin)
        } else {
          const startId = connection.startCardId
          const endId = connection.endCardId
          connection.path = utils.connectionBetweenCards(startId, endId)
        }
        return connection
      })
      connections = sortBy(connections, ['distanceFromOrigin'])
      // restore space
      if (!isRemote) {
        context.commit('currentCards/clear', null, { root: true })
        context.commit('currentConnections/clear', null, { root: true })
        context.dispatch('updateModulesSpaceId', space)
      }
      context.commit('isLoadingSpace', true, { root: true })
      context.commit('restoreSpace', space)
      context.dispatch('loadBackground')
      // split into chunks
      const cardChunks = utils.splitArrayIntoChunks(cards, chunkSize)
      const connectionChunks = utils.splitArrayIntoChunks(connections, chunkSize)
      let primaryIsCards = true
      let primaryChunks = cardChunks
      let secondaryChunks = connectionChunks
      if (connectionChunks.length > cardChunks.length) {
        primaryIsCards = false
        primaryChunks = connectionChunks
        secondaryChunks = cardChunks
      }
      // restore space
      if (!primaryChunks.length) {
        context.dispatch('restoreSpaceComplete', { space, isRemote, timeStart })
        return
      }
      context.commit('currentConnections/restoreTypes', connectionTypes, { root: true })
      primaryChunks.forEach((chunk, index) => {
        defer(function () {
          if (space.id !== context.state.id) { return }
          if (!isRemote && isLoadingRemoteSpace) { return }
          // primary
          if (primaryIsCards) {
            context.commit('currentCards/restore', chunk, { root: true })
          } else {
            context.commit('currentConnections/restore', chunk, { root: true })
          }
          // secondary
          chunk = secondaryChunks[index]
          if (chunk && primaryIsCards) {
            context.commit('currentConnections/restore', chunk, { root: true })
          } else if (chunk) {
            context.commit('currentCards/restore', chunk, { root: true })
          }
          context.dispatch('currentCards/updateCardMap', null, { root: true })
          // complete
          const isRestoreComplete = index === primaryChunks.length - 1
          if (isRestoreComplete) {
            context.dispatch('restoreSpaceComplete', { space, isRemote, timeStart })
          }
        })
      })
    },
    restoreSpaceComplete: (context, { space, isRemote, timeStart }) => {
      context.commit('isLoadingSpace', false, { root: true })
      const timeEnd = utils.normalizeToUnixTime(new Date())
      let emoji = '🌳'
      if (isRemote) {
        emoji = '🌳🌏'
      }
      let cards = context.rootState.currentCards.ids.length
      let connections = context.rootState.currentConnections.ids.length
      console.log(`${emoji} Restore space complete in ${timeEnd - timeStart}ms,`, {
        cards,
        connections,
        spaceName: space.name,
        isRemote,
        cardUsers: context.rootGetters['currentCards/userIds']
      })
      context.dispatch('updateSpacePageSize')
      if (isRemote) {
        context.dispatch('undoHistory/playback', null, { root: true })
        context.dispatch('checkIfShouldNotifySignUpToEditSpace', space)
        context.dispatch('checkIfShouldNotifySpaceIsRemoved', space)
        if (cache.getAllSpaces().length) {
          context.commit('notifyNewUser', false, { root: true })
        } else {
          context.commit('notifyNewUser', true, { root: true })
          console.log('💁‍♀️ notifyNewUser', cache.getAllSpaces())
        }
      }
      context.commit('broadcast/joinSpaceRoom', null, { root: true })
      context.commit('currentUser/updateFavoriteSpaceIsEdited', space.id, { root: true })
      nextTick(() => {
        context.dispatch('scrollCardsIntoView')
        context.dispatch('updatePageSizes', null, { root: true })
        // deferrable async tasks
        context.dispatch('updateOtherUsers')
        context.dispatch('updateOtherSpaces')
        context.dispatch('currentConnections/correctPaths', { shouldUpdateApi: isRemote }, { root: true })
        context.dispatch('currentCards/updateDimensions', null, { root: true })
        context.dispatch('currentCards/updateCardMap', null, { root: true })
        context.commit('triggerUpdateCardOverlaps', null, { root: true })
      })
    },
    loadSpace: async (context, { space, isLocalSpaceOnly }) => {
      const emptySpace = utils.emptySpace(space.id)
      const cachedSpace = cache.space(space.id) || space
      const user = context.rootState.currentUser
      cachedSpace.id = cachedSpace.id || space.id
      // clear state
      isLoadingRemoteSpace = false
      context.commit('notifySpaceIsRemoved', false, { root: true })
      context.commit('spaceUrlToLoad', '', { root: true })
      context.commit('userHasScrolled', false, { root: true })
      context.commit('broadcast/leaveSpaceRoom', { user, type: 'userLeftRoom' }, { root: true })
      context.commit('clearAllNotifications', null, { root: true })
      context.commit('clearSpaceFilters', null, { root: true })
      context.commit('clearSearch', null, { root: true })
      context.commit('hasEditedCurrentSpace', false, { root: true })
      context.commit('shouldPreventNextEnterKey', false, { root: true })
      // restore local space
      context.commit('restoreSpace', emptySpace)
      space = utils.normalizeSpace(cachedSpace)
      context.dispatch('restoreSpaceInChunks', { space })
      context.commit('undoHistory/clear', null, { root: true })
      // merge with remote space items updated, added, removed
      if (isLocalSpaceOnly) { return }
      let remoteSpace = await context.dispatch('getRemoteSpace', space)
      if (!remoteSpace) { return }
      const spaceIsUnchanged = utils.spaceIsUnchanged(cachedSpace, remoteSpace)
      if (spaceIsUnchanged) { return }
      isLoadingRemoteSpace = true
      remoteSpace = utils.normalizeSpace(remoteSpace)
      // cards
      const cards = context.rootGetters['currentCards/all']
      const cardResults = utils.mergeSpaceKeyValues({ prevItems: cards, newItems: remoteSpace.cards })
      context.dispatch('currentCards/mergeUnique', cardResults.updateItems, { root: true })
      context.dispatch('currentCards/mergeRemove', cardResults.removeItems, { root: true })
      // connectionTypes
      const connectionTypes = context.rootGetters['currentConnections/allTypes']
      const connectionTypeReults = utils.mergeSpaceKeyValues({ prevItems: connectionTypes, newItems: remoteSpace.connectionTypes })
      context.dispatch('currentConnections/mergeUnique', { newItems: connectionTypeReults.updateItems, itemType: 'type' }, { root: true })
      context.dispatch('currentConnections/mergeRemove', { removeItems: connectionTypeReults.removeItems, itemType: 'type' }, { root: true })
      // connections
      const connections = context.rootGetters['currentConnections/all']
      const connectionResults = utils.mergeSpaceKeyValues({ prevItems: connections, newItems: remoteSpace.connections })
      context.dispatch('currentConnections/mergeUnique', { newItems: connectionResults.updateItems, itemType: 'connection' }, { root: true })
      context.dispatch('currentConnections/mergeRemove', { removeItems: connectionResults.removeItems, itemType: 'connection' }, { root: true })
      console.log('🎑 Merge space', {
        cards: cardResults,
        types: connectionTypeReults,
        connections: connectionResults,
        localSpace: space,
        space: remoteSpace
      })
      context.dispatch('restoreSpaceInChunks', {
        space: remoteSpace,
        isRemote: true,
        addCards: cardResults.addItems,
        addConnectionTypes: connectionTypeReults.addItems,
        addConnections: connectionResults.addItems
      })
    },
    loadLastSpace: async (context) => {
      let space
      const user = context.rootState.currentUser
      let spaceToRestore = cache.space(user.lastSpaceId)
      if (spaceToRestore.id) {
        space = spaceToRestore
      } else if (user.lastSpaceId) {
        space = { id: user.lastSpaceId }
      }
      if (space) {
        context.dispatch('loadSpace', { space })
      } else {
        await context.dispatch('createNewHelloSpace')
      }
      context.dispatch('updateUserLastSpaceId')
    },
    updateSpace: async (context, updates) => {
      const space = utils.clone(context.state)
      updates.id = space.id
      if (updates.name) {
        const updatedSpace = utils.clone(space)
        updatedSpace.name = updates.name
      }
      context.commit('updateSpace', updates)
      context.dispatch('broadcast/update', { updates, type: 'updateSpace' }, { root: true })
      context.dispatch('api/addToQueue', {
        name: 'updateSpace',
        body: updates
      }, { root: true })
    },
    changeSpace: async (context, { space, isRemote }) => {
      console.log('🚟 Change space', { space, isRemote })
      context.commit('notifySpaceNotFound', false, { root: true })
      space = utils.clone(space)
      space = utils.migrationEnsureRemovedCards(space)
      await context.dispatch('loadSpace', { space })
      context.commit('triggerUpdateWindowHistory', { space, isRemote }, { root: true })
      const userIsMember = context.rootGetters['currentUser/isSpaceMember']
      if (!userIsMember) { return }
      context.dispatch('api/addToQueue', {
        name: 'updateSpace',
        body: { id: space.id, updatedAt: new Date() }
      }, { root: true })
      context.commit('parentCardId', '', { root: true })
      context.dispatch('updateUserLastSpaceId')
      const cardId = context.rootState.loadSpaceShowDetailsForCardId
      if (cardId) {
        context.dispatch('currentCards/showCardDetails', cardId, { root: true })
      }
    },
    updateUserLastSpaceId: (context) => {
      const space = context.state
      const canEdit = context.rootGetters['currentUser/canEditSpace']()
      if (space.isRemoved || !canEdit) { return }
      context.dispatch('currentUser/lastSpaceId', space.id, { root: true })
    },
    removeCurrentSpace: (context) => {
      const space = utils.clone(context.state)
      context.dispatch('decrementCardsCreatedCountFromSpace', space)
      cache.removeSpace(space)
      context.dispatch('api/addToQueue', {
        name: 'removeSpace',
        body: { id: space.id }
      }, { root: true })
    },
    deleteSpace: (context, space) => {
      cache.deleteSpace(space)
      context.dispatch('api/addToQueue', {
        name: 'deleteSpace',
        body: space
      }, { root: true })
    },
    restoreRemovedSpace: async (context, space) => {
      cache.restoreRemovedSpace(space)
      const restoredSpace = await context.dispatch('api/restoreRemovedSpace', space, { root: true })
      space = restoredSpace || space
      context.dispatch('incrementCardsCreatedCountFromSpace', space)
      context.dispatch('changeSpace', { space })
    },
    deleteAllRemovedSpaces: (context) => {
      const userId = context.rootState.currentUser.id
      const removedSpaces = cache.getAllRemovedSpaces()
      removedSpaces.forEach(space => cache.deleteSpace(space))
      context.dispatch('api/addToQueue', { name: 'deleteAllRemovedSpaces', body: { userId } }, { root: true })
    },
    checkIfShouldNotifySpaceIsRemoved: (context, space) => {
      const canEdit = context.rootGetters['currentUser/canEditSpace']()
      if (space.isRemoved && canEdit) {
        context.commit('notifySpaceIsRemoved', true, { root: true })
      } else {
        context.commit('notifySpaceIsRemoved', false, { root: true })
      }
    },
    checkIfShouldNotifySignUpToEditSpace: (context, space) => {
      const spaceIsOpen = space.privacy === 'open'
      const currentUserIsSignedIn = context.rootGetters['currentUser/isSignedIn']
      const currentUserIsInvitedButCannotEditSpace = context.rootGetters['currentUser/isInvitedButCannotEditSpace'](space)
      if (spaceIsOpen && !currentUserIsSignedIn) {
        context.commit('notifySignUpToEditSpace', true, { root: true })
      } else if (currentUserIsInvitedButCannotEditSpace) {
        context.commit('notifySignUpToEditSpace', true, { root: true })
      } else {
        context.commit('notifySignUpToEditSpace', false, { root: true })
      }
    },
    removeCollaboratorFromSpace: (context, user) => {
      const space = utils.clone(context.state)
      const userName = user.name || 'User'
      context.dispatch('broadcast/update', { user, type: 'userLeftSpace' }, { root: true })
      context.dispatch('api/removeSpaceCollaborator', { space, user }, { root: true })
      context.commit('removeCollaboratorFromSpace', user)
      const isCurrentUser = user.id === context.rootState.currentUser.id
      if (isCurrentUser) {
        context.dispatch('loadLastSpace')
        cache.removeInvitedSpace(space)
        cache.deleteSpace(space)
        context.commit('addNotification', { message: `You left ${space.name}`, type: 'success' }, { root: true })
      } else {
        context.commit('addNotification', { message: `${userName} removed from space`, type: 'success' }, { root: true })
      }
    },
    scrollCardsIntoView: (context) => {
      if (context.rootState.userHasScrolled) { return }
      const origin = { x: window.scrollX, y: window.scrollY }
      let cards = utils.clone(context.rootGetters['currentCards/all'])
      cards = cards.map(card => {
        card = {
          x: card.x,
          y: card.y,
          distanceFromOrigin: utils.distanceBetweenTwoPoints(card, origin),
          name: card.name //
        }
        return card
      })
      cards = sortBy(cards, ['distanceFromOrigin'])
      const card = cards[0]
      if (!card) { return }
      const xIsVisible = utils.isBetween({ value: card.x, min: origin.x, max: context.rootState.viewportWidth + origin.x })
      const yIsVisible = utils.isBetween({ value: card.y, min: origin.y, max: context.rootState.viewportHeight + origin.y })
      if (xIsVisible && yIsVisible) { return }
      const position = {
        x: Math.max(card.x - 100, 0),
        y: Math.max(card.y - 100, 0)
      }
      nextTick(() => {
        window.scrollTo(position.x, position.y)
      })
    },

    // User Card Count

    checkIfShouldNotifyCardsCreatedIsNearLimit: (context) => {
      const spaceUserIsUpgraded = context.getters.spaceUserIsUpgraded
      if (spaceUserIsUpgraded) { return }
      const currentUser = context.rootState.currentUser
      if (currentUser.isUpgraded) { return }
      const cardsCreatedLimit = context.rootState.cardsCreatedLimit
      const value = cardsCreatedLimit - currentUser.cardsCreatedCount
      if (utils.isBetween({ value, min: 0, max: 10 })) {
        context.commit('notifyCardsCreatedIsNearLimit', true, { root: true })
      }
    },
    incrementCardsCreatedCountFromSpace (context, space) {
      const user = context.rootState.currentUser
      const incrementCardsCreatedCountBy = space.cards.filter(card => {
        return card.userId === user.id
      }).length
      context.dispatch('currentUser/cardsCreatedCountUpdateBy', {
        delta: incrementCardsCreatedCountBy
      }, { root: true })
    },
    decrementCardsCreatedCountFromSpace (context, space) {
      const user = context.rootState.currentUser
      const decrementCardsCreatedCountBy = space.cards.filter(card => {
        return card.userId === user.id
      }).length
      context.dispatch('currentUser/cardsCreatedCountUpdateBy', {
        delta: -decrementCardsCreatedCountBy
      }, { root: true })
    },

    notifyCollaboratorsCardUpdated: (context, { cardId, type }) => {
      if (context.state.name === 'Hello Kinopio') { return }
      if (notifiedCardAdded.includes(cardId)) { return }
      const userCanEdit = context.rootGetters['currentUser/canEditSpace']()
      if (!userCanEdit) { return }
      const userId = context.rootState.currentUser.id
      let recipientUserIds = context.getters.userIdsToNotify
      recipientUserIds = recipientUserIds.filter(recipientUserId => recipientUserId !== userId)
      recipientUserIds = recipientUserIds.filter(id => Boolean(id))
      if (!recipientUserIds.length) { return }
      const notification = {
        type, // 'createCard' or 'updateCard'
        cardId,
        userId,
        recipientUserIds,
        spaceId: context.state.id
      }
      context.dispatch('api/addToQueue', { name: 'createCardNotifications', body: notification }, { root: true })
      notifiedCardAdded.push(cardId)
    },

    // Background

    loadBackground: (context) => {
      const element = document.querySelector('.app')
      if (!element) { return }
      const background = context.state.background
      if (utils.urlIsImage(background)) {
        element.style.backgroundImage = `url(${background})`
      } else {
        element.style.backgroundImage = ''
      }
      context.dispatch('updateBackgroundZoom')
    },
    updateBackgroundZoom: async (context) => {
      const element = document.querySelector('.app')
      if (!element) { return }
      const defaultBackground = {
        width: 310,
        height: 200
      }
      const spaceZoomDecimal = context.rootGetters.spaceZoomDecimal
      let backgroundImage = element.style.backgroundImage
      backgroundImage = utils.urlFromCSSBackgroundImage(backgroundImage)
      let image = new Image()
      let width, height
      if (backgroundImage) {
        image.src = backgroundImage
        width = image.width
        height = image.height
      } else {
        width = defaultBackground.width
        height = defaultBackground.height
      }
      width = width * spaceZoomDecimal
      height = height * spaceZoomDecimal
      if (width === 0 || height === 0) {
        element.style.backgroundSize = 'initial'
        return
      }
      element.style.backgroundSize = `${width}px ${height}px`
    },

    // Tags

    addTag: (context, tag) => {
      let tagsInCard = context.getters.tagsInCard({ id: tag.cardId })
      tagsInCard = tagsInCard.map(card => card.name)
      if (tagsInCard.includes(tag.name)) { return }
      context.commit('addTag', tag)
      const update = { name: 'addTag', body: tag }
      const broadcastUpdate = { updates: tag, type: 'addTag' }
      context.dispatch('api/addToQueue', update, { root: true })
      context.dispatch('broadcast/update', broadcastUpdate, { root: true })
      context.commit('remoteTagsIsFetched', false, { root: true })
    },
    removeTag: (context, tag) => {
      context.commit('removeTag', tag)
      const update = { name: 'removeTag', body: tag }
      const broadcastUpdate = { updates: tag, type: 'removeTag' }
      context.dispatch('api/addToQueue', update, { root: true })
      context.dispatch('broadcast/update', broadcastUpdate, { root: true })
      context.commit('remoteTagsIsFetched', false, { root: true })
    },
    removeTags: (context, tag) => {
      context.commit('removeTags', tag)
      const update = { name: 'removeTags', body: tag }
      context.dispatch('api/addToQueue', update, { root: true })
      context.commit('remoteTagsIsFetched', false, { root: true })
    },
    updateTagNameColor: (context, tag) => {
      context.commit('updateTagNameColor', tag)
      const update = { name: 'updateTagNameColor', body: tag }
      const broadcastUpdate = { updates: tag, type: 'updateTagNameColor' }
      context.dispatch('api/addToQueue', update, { root: true })
      context.dispatch('broadcast/update', broadcastUpdate, { root: true })
      context.commit('remoteTagsIsFetched', false, { root: true })
    },
    removeUnusedTagsFromCard: (context, cardId) => {
      const card = context.rootGetters['currentCards/byId'](cardId)
      if (!card) { return }
      const cardTagNames = utils.tagsFromStringWithoutBrackets(card.name) || []
      const tagsInCard = context.getters.tagsInCard({ id: cardId })
      const tagsToRemove = tagsInCard.filter(tag => !cardTagNames.includes(tag.name))
      tagsToRemove.forEach(tag => context.dispatch('removeTag', tag))
    }
  },

  getters: {
    all: (state, getters, rootState, rootGetters) => {
      let space = utils.clone(state)
      space.cards = utils.clone(rootGetters['currentCards/all'])
      space.connections = utils.clone(rootGetters['currentConnections/all'])
      space.connectionTypes = utils.clone(rootGetters['currentConnections/allTypes'])
      return space
    },

    // meta

    isHelloKinopio: (state) => {
      return state.name === 'Hello Kinopio'
    },
    shouldBroadcast: (state) => {
      const users = state.users.length
      const collaborators = state.collaborators.length
      const spectators = state.spectators.length
      const clients = state.clients.length
      const total = users + collaborators + spectators + clients
      const shouldBroadcast = Boolean(total > 2) // currentUser and currentClient
      return shouldBroadcast
    },
    shouldUpdateApi: (state, getters, rootState, rootGetters) => {
      const isSpaceMember = rootGetters['currentUser/isSpaceMember']
      const isSignedIn = rootGetters['currentUser/isSignedIn']
      return isSpaceMember && isSignedIn
    },
    isFavorite: (state, getters, rootState) => {
      const favoriteSpaces = rootState.currentUser.favoriteSpaces
      const isFavoriteSpace = favoriteSpaces.filter(space => space.id === state.id)
      return Boolean(isFavoriteSpace.length)
    },
    url: (state) => {
      const domain = utils.kinopioDomain()
      const spaceUrl = utils.url({ name: state.name, id: state.id })
      return `${domain}/${spaceUrl}`
    },

    // tags

    tags: (state, getters, rootState) => {
      const mergedTags = utils.mergeArrays({ previous: rootState.otherTags, updated: state.tags, key: 'name' })
      return mergedTags
    },
    tagByName: (state, getters) => (name) => {
      const tags = getters.tags
      return tags.find(tag => {
        return tag.name === name
      })
    },
    tagsInCard: (state, getters) => (card) => {
      const tags = getters.tags
      return tags.filter(tag => tag.cardId === card.id)
    },
    spaceTags: (state, getters) => {
      let tags = state.tags
      tags = uniqBy(tags, 'name')
      return tags
    },

    // users

    members: (state, getters, rootState) => (excludeCurrentUser) => {
      const users = state.users
      const collaborators = state.collaborators || []
      let members = []
      users.forEach(user => {
        members.push(user)
      })
      collaborators.forEach(user => {
        members.push(user)
      })
      if (excludeCurrentUser) {
        members = members.filter(user => user.id !== rootState.currentUser.id)
      }
      return members
    },
    memberById: (state, getters, rootState) => (id) => {
      const members = getters.members()
      return members.find(member => member.id === id)
    },
    userById: (state, getters, rootState, rootGetters) => (id) => {
      let user = getters.memberById(id) || rootGetters.otherUserById(id)
      if (rootState.currentUser.id === id) {
        user = rootState.currentUser
      }
      return user
    },
    spaceUserIsUpgraded: (state, getters, rootState) => {
      const currentUser = rootState.currentUser
      const users = state.users
      const userIds = users.map(user => user.id)
      if (userIds.includes(currentUser.id)) { return }
      let userIsUpgraded
      users.forEach(user => {
        if (user.isUpgraded) { userIsUpgraded = true }
      })
      return userIsUpgraded
    },
    spaceUserIsCurrentUser: (state, getters, rootState) => {
      const currentUser = rootState.currentUser
      const users = state.users
      const userIds = users.map(user => user.id)
      return userIds.includes(currentUser.id)
    },
    shouldPreventAddCard: (state, getters, rootState, rootGetters) => {
      const cardsCreatedIsOverLimit = rootGetters['currentUser/cardsCreatedIsOverLimit']
      const spaceUserIsUpgraded = getters.spaceUserIsUpgraded
      return cardsCreatedIsOverLimit && !spaceUserIsUpgraded
    },
    userIdsToNotify: (state, getters, rootState, rootGetters) => {
      let clients = state.clients.map(client => client.id)
      let members = getters.members(true)
      let contributors = [] // for open spaces
      members = members.map(member => member.id)
      contributors = state.cards.map(card => card.userId)
      let userIds = members.concat(contributors)
      userIds = uniq(userIds)
      // exclude currently connected userIds
      userIds = userIds.filter(userId => !clients.includes(userId))
      return userIds
    }
  }
}
