// functional methods that can see dom, but can't use vue

export default {
  cursorPosition (event) {
    let x, y
    if (event.touches) {
      x = event.touches[0].clientX
      y = event.touches[0].clientY
    } else {
      x = event.clientX
      y = event.clientY
    }
    return { x, y }
  },

  elementCenter (rect) {
    const x = Math.round(rect.x + (rect.width / 2))
    const y = Math.round(rect.y + (rect.height / 2))
    return { x, y }
  },

  between ({ value, min, max }) {
    if (min <= value && value <= max) { return true }
  },

  clone (object) {
    let cloned = JSON.stringify(object)
    cloned = JSON.parse(cloned)
    return cloned
  },

  typeCheck (value, type, allowUndefined) {
    if (allowUndefined && value === undefined) {
      return
    }
    if (type === 'array' && Array.isArray(value)) {
      return
    }
    if (typeof value !== type) { // eslint-disable-line valid-typeof
      console.error(`passed value is not ${type}`, value)
    }
  },

  updateObject (object, value) {
    this.typeCheck(value, 'object')
    const keys = Object.keys(value)
    if (keys.length === 0) {
      object = {}
    } else {
      keys.forEach(key => {
        object[key] = value[key]
      })
    }
    return object
  },

  cursorsAreClose (startCursor, endCursor) {
    const threshold = 5
    const xRange = {
      value: endCursor.x,
      min: startCursor.x - threshold,
      max: startCursor.x + threshold
    }
    const yRange = {
      value: endCursor.y,
      min: startCursor.y - threshold,
      max: startCursor.y + threshold
    }
    return this.between(xRange) && this.between(yRange)
  },

  // User Prefs

  storeLocal (key, value) {
    try {
      window.localStorage[key] = JSON.stringify(value)
    } catch (error) {
      console.warn('Could not save to localStorage. (localStorage is disabled in private Safari windows)')
    }
  },

  getLocal (key) {
    try {
      return JSON.parse(window.localStorage[key])
    } catch (error) {}
  },

  getUserPrefs () {
    return this.getLocal('userPrefs') || {}
  },

  getUserPref (key) {
    return this.getUserPrefs()[key]
  },

  updateUserPrefs (key, value) {
    let prefs = this.getUserPrefs()
    prefs[key] = value
    this.storeLocal('userPrefs', prefs)
  },

  // Connection Path Utils 🐙

  connectorCoords (blockId) {
    let rect = document.querySelector(`.connector[data-block-id="${blockId}"]`).getBoundingClientRect()
    return this.elementCenter(rect)
  },

  coordsWithCurrentScrollOffset ({ x, y }) {
    const offsetX = x + window.scrollX
    const offsetY = y + window.scrollY
    return { x: offsetX, y: offsetY }
  },

  connectionBetweenBlocks (startId, endId) {
    let start = this.connectorCoords(startId)
    let end = this.connectorCoords(endId)
    return this.connectionPathBetweenCoords(start, end)
  },

  curveControlPoint (start, end) {
    // TODO: as you're drawing, manipulate the curvecontrolpoint to be more pleasing
    return 'q90,40'
  },

  connectionPathBetweenCoords (start, end) {
    // console.log(start, this.coordsWithCurrentScrollOffset(start))
    const offsetStart = this.coordsWithCurrentScrollOffset(start)
    const offsetEnd = this.coordsWithCurrentScrollOffset(end)

    const delta = {
      x: (offsetEnd.x - offsetStart.x),
      y: (offsetEnd.y - offsetStart.y)
    }
    let curve = this.curveControlPoint(offsetStart, delta)
    return `m${offsetStart.x},${offsetStart.y} ${curve} ${delta.x},${delta.y}`
  },

  // Edge Scrolling Utils 👻

  distancesFromEdge (viewportSize) {
    return {
      far: Math.round((8 / 100) * viewportSize),
      medium: Math.round((4 / 100) * viewportSize),
      close: Math.round((2 / 100) * viewportSize)
    }
  },

  distancesToScroll (viewportSize) {
    return {
      far: Math.round((2 / 100) * viewportSize),
      medium: Math.round((4 / 100) * viewportSize),
      close: Math.round((6 / 100) * viewportSize)
    }
  },

  proximityTypeFromEdge (position, distances, viewportSize) {
    let close, medium, far
    if (viewportSize) {
      close = position > (viewportSize - distances.close)
      medium = position > (viewportSize - distances.medium)
      far = position > (viewportSize - distances.far)
    } else {
      close = position < distances.close
      medium = position < distances.medium
      far = position < distances.far
    }
    if (close) { return 'close' }
    if (medium) { return 'medium' }
    if (far) { return 'far' }
  }

}
