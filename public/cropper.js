window.setupCropper = function (flickrObject, requirement, photo, crop) {
  var img = new Image()
  img.requirement = requirement
  img.photo = photo
  img.crop = crop || { x: 0, y: 0, width: 0, height: 0, cropid: 'new-' + Math.random() }
  img.flickrObject = flickrObject
  img.onload = onImageLoadComplete
  img.src = 'https://farm' + flickrObject.farm + '.staticflickr.com/' + flickrObject.server + '/' +
    flickrObject.id + '_' + flickrObject.secret + '_b.jpg'
}

/**
 * set up the cropping elements
 * @param {Event} e
 * @function
 * @private
 */
function onImageLoadComplete (e) {
  var img = e.target
  img.crop.o_width = img.flickrObject ? img.flickrObject.o_width : img.width
  img.crop.o_height = img.flickrObject ? img.flickrObject.o_height : img.height
  img.crop.r_width = img.requirement.width
  img.crop.r_height = img.requirement.height

  var minWidth = Math.ceil(img.requirement.width * (img.width / img.crop.o_width))
  var minHeight = Math.ceil(minWidth * (img.requirement.height / img.requirement.width))
  var maxWidth = minWidth * (img.width / minWidth)
  var maxHeight = maxWidth * (img.requirement.height / img.requirement.width)

  if (maxHeight > img.height) {
    maxHeight = img.height
    maxWidth = Math.ceil(maxHeight * (img.requirement.width / img.requirement.height))
  }

  img.crop.minWidth = minWidth
  img.crop.maxWidth = maxWidth
  img.crop.minHeight = minHeight
  img.crop.maxHeight = maxHeight

  img.crop.requirementid = img.requirement.requirementid
  img.crop.width = img.crop.maxWidth
  img.crop.height = img.crop.maxHeight
  img.crop.x = Math.floor((img.width - img.crop.maxWidth) / 2)
  img.crop.y = Math.floor((img.height - img.crop.height) / 2)

  var requirementid = img.requirement.requirementid

  var photoLI = document.getElementById('crop__li--' + requirementid)
  photoLI.style.width = img.width + 'px'
  photoLI.style.height = img.height + 'px'
  photoLI.style.backgroundImage = 'url(' + img.src + ')'
  // photoLI.style.maxWidth = '100%'
  photoLI.img = img

  photoLI.onmousedown = onMouseDownStartDragOrResize
  document.addEventListener('mousemove', onMouseMoveDragOrResize)
  document.addEventListener('mouseup', onMouseUpStopDragAndResize)

  function onMouseDownStartDragOrResize (e) {
    var name = e.target.getAttribute('name')
    if (name === 'drag') {
      img.drag = true
      img.resize = false
      img.lastMouseX = e.pageX - e.screenX
      img.lastMouseY = e.pageY - e.screenY
      photoLI.style.cursor = 'move'
    } else if (name === 'resize') {
      img.drag = false
      img.resize = true
      img.lastMouseX = e.pageX - e.screenX
      img.lastMouseY = e.pageY - e.screenY
      photoLI.style.cursor = 'nwse-resize'
    }
  }

  function onMouseMoveDragOrResize (e) {
    if (!img.drag && !img.resize) {
      return
    }

    if (img.drag) {
      onMouseMoveDrag(e, img)
    } else if (img.resize) {
      onMouseMoveResize(e, img)
    }
  }

  function onMouseUpStopDragAndResize (e) {
    photoLI.style.cursor = ''
    img.drag = false
    img.resize = false
  }

  var borderDiv = document.getElementById('border__div--' + requirementid)
  borderDiv.style.display = 'block'
  borderDiv.onmouseup = borderDiv.children[0].onmouseup = onMouseUpStopDragAndResize

  var frameDiv = document.getElementById('frame__div--' + requirementid)
  frameDiv.style.display = 'block'

  return renderCropRegion(img)
}

/**
 * repositions the crop area when it is dragged
 * @param {Event} e
 * @function
 * @private
 */
function onMouseMoveDrag (e, img) {
  var mouseX = e.screenX
  var mouseY = e.screenY
  var diffX = mouseX - img.lastMouseX
  var diffY = mouseY - img.lastMouseY
  var newX = img.crop.x + diffX
  var newY = img.crop.y + diffY

  img.lastMouseX = mouseX
  img.lastMouseY = mouseY

  if (newX < 0 || newX + img.crop.width > img.width) {
    return
  }

  if (newY < 0 || newY + img.crop.height > img.height) {
    return
  }

  if (img.crop.x === newX && img.crop.y === newY) {
    return
  }

  img.crop.x = newX
  img.crop.y = newY
  renderCropRegion(img)
}

/**
 * resizes the crop area when the top-left corner square is dragged
 * @param {Event} e
 * @function
 * @private
 */
function onMouseMoveResize (e, img) {
  var mouseX = e.screenX
  var mouseY = e.screenY
  var diffX = mouseX - img.lastMouseX
  var newWidth = img.crop.width + diffX
  var newHeight = newWidth * (img.requirement.height / img.requirement.width)

  img.lastMouseX = mouseX
  img.lastMouseY = mouseY

  if (newWidth + img.crop.x > img.width) {
    return
  }
  if (newHeight + img.crop.y > img.height) {
    return
  }

  if (newWidth > img.width || newWidth < img.crop.minWidth) {
    return
  }
  if (newHeight > img.crop.maxHeight || newHeight < img.crop.minHeight) {
    return
  }

  img.crop.width = newWidth
  img.crop.height = newHeight
  renderCropRegion(img)
}

/**
 * positions and shapes the border and dark divs that surround the crop region
 * to highlight the cropped portion of the image
 * @function
 * @private
 */
function renderCropRegion (img) {
  var requirement = img.requirement
  var requirementid = requirement.requirementid
  var leftDiv = document.getElementById('left__div--' + requirementid)
  leftDiv.style.left = '0'
  leftDiv.style.top = '0'
  leftDiv.style.width = img.crop.x + 'px'
  leftDiv.style.height = img.height + 'px'

  var rightDiv = document.getElementById('right__div--' + requirementid)
  rightDiv.style.left = (img.crop.x + img.crop.width) + 'px'
  rightDiv.style.top = '0'
  rightDiv.style.width = (img.width - img.crop.x - img.crop.width) + 'px'
  rightDiv.style.height = img.height + 'px'

  var topDiv = document.getElementById('top__div--' + requirementid)
  topDiv.style.left = img.crop.x + 'px'
  topDiv.style.top = '0'
  topDiv.style.width = img.crop.width + 'px'
  topDiv.style.height = img.crop.y + 'px'

  var bottomDiv = document.getElementById('bottom__div--' + requirementid)
  bottomDiv.style.left = img.crop.x + 'px'
  bottomDiv.style.top = (img.crop.y + img.crop.height) + 'px'
  bottomDiv.style.width = img.crop.width + 'px'
  bottomDiv.style.height = (img.height - img.crop.y - img.crop.height) + 'px'

  var borderDiv = document.getElementById('border__div--' + requirementid)
  borderDiv.style.width = img.crop.width + 'px'
  borderDiv.style.height = img.crop.height + 'px'
  borderDiv.style.left = img.crop.x + 'px'
  borderDiv.style.top = img.crop.y + 'px'
  borderDiv.children[0].style.right = 0 + 'px'
  borderDiv.children[0].style.bottom = 0 + 'px'
}
