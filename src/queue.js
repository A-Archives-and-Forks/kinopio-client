import _ from 'lodash'

import cache from '@/cache.js'
import api from '@/api.js'

let queueIsRunning = false

window.onload = () => {
  self.process()
  setInterval(() => {
    self.process()
  }, 60 * 1000) // 60 seconds
}

const self = {
  queue () {
    return cache.queue()
  },
  async add (name, body) {
    const userIsSignedIn = cache.user().apiKey
    if (!userIsSignedIn) { return }
    let queue = this.queue()
    const request = {
      name,
      body
    }
    queue.push(request)
    console.log('💞 Add to queue', request)
    // queue = queue.reduce(squash)
    cache.saveQueue(queue)
    console.log('pre squash queue', queue.length, queue)
    self.squash()
    _.debounce(_.wrap(this.process()), 5000) // 5 seconds
  },

  // TODO squash() test

  // inputs
  // {name: 'Updatecard', {body: id: 1, name: "add"}
  // {name: 'Updatecard', {body: id: 1, frameid: 9}
  // {name: 'yolo', {body: id: 2, prop2: "xyz"}
  // {name: 'Updatecard', {body: id: 1, prop1: "123", x: 23, y: 12}
  // {name: 'Updatecard', {body: id: 1, name: "added"}
  // {name: 'Updatecard', {body: id: 1, name: "added pop"}

  // expected outputs
  // {name: 'Updatecard', {body: id: 1, prop1: "123", x: 23, y: 12, frameid: 9, name: "added pop"}
  // {name: 'yolo', {body: id: 2, prop2: "xyz"}

  squash () {
    let queue = this.queue()
    let squashed = []
    queue.forEach(request => {
      const isSquashed = squashed.find(item => item.name === request.name && item.body.id === request.body.id)
      if (isSquashed) { return }
      const matches = queue.filter(item => item.name === request.name && item.body.id === request.body.id)
      const reduced = matches.reduce((accumulator, currentValue) => _.merge(accumulator, currentValue))
      reduced.name = request.name
      squashed.push(reduced)
    })
    console.log('✝️ squashed', squashed)
    cache.saveQueue(squashed)
    // console.log('✝️✝️ squashed cache', cache.queue())
  },
  next () {
    const queue = this.queue()
    const request = queue.shift()
    cache.saveQueue(queue)
    return request
  },
  async process () {
    // console.log('this should be debounced')

    if (queueIsRunning) { return }
    if (!window.navigator.onLine) { return }
    let queue = this.queue()
    if (!queue.length) { return }
    queueIsRunning = true
    let request
    do {
      try {
        request = this.next()
        await this.processRequest(request)
        console.log('✅', request)
      } catch (error) {
        queue.push(request)
        console.error(error)
        console.log('🔁 Request error. Add back into queue to retry', request)
        cache.saveQueue(queue)
        queueIsRunning = false
        break
      }
      queue = this.queue()
    } while (queue.length > 0)
    queueIsRunning = false
  },
  async processRequest (request) {
    console.log('🚎🚎🚎 Processing request', request.name, request.body)
    const response = await api[request.name](request.body)
    const normalizedResponse = await api.normalizeResponse(response)
    return normalizedResponse
  }
}

export default self
