const dashboard = require('@userappstore/dashboard')
const flickrAPI = require('@puzzleboss/flickrapi')
const Navigation = require('./navbar-options.js')
const util = require('util')
const requiredWidth = process.env.HD_WIDTH || 3072
const requiredHeight = process.env.HD_HEIGHT || 2304

let flickr = null
flickrAPI.tokenOnly({
  api_key: process.env.FLICKR_API_KEY,
  secret: process.env.FLICKR_SECRET_KEY,
  progress: false
}, (_, pflickr) => {
  flickr = flickr || pflickr
})

module.exports = {
  before: beforeRequest,
  get: renderPage,
  post: submitForm
}

async function beforeRequest (req) {
  if (!flickr) {
    throw new Error('flickrapi-not-ready')
  }
  const searches = await dashboard.Redis.lrangeAsync('searches:list', 0, -1)
  if (searches && searches.length) {
    for (const i in searches) {
      searches[i] = { search: searches[i] }
    }
  }
  req.data = {searches}
}

async function renderPage (req, res, messageTemplate) {
  const doc = dashboard.HTML.parse(req.route.pageHTML, __dirname)
  await Navigation.render(req, doc)
  let addDeleteSearchLink = true
  if (req.query && req.query.search) {
    // get search results
    let results
    try {
      results = await searchFlickr(req.query.search)
    } catch (error) {
      messageTemplate = 'submit-error-template'
    }
    if (results && results.length) {
      doc.renderList(results, 'result-item-template', 'results')
      // store the search text if it's new and not a photo id
      if (results.length === 1) {
        if (req.query.search.toString() !== results[0].id.toString()) {
          let found = false
          if (req.data.searches.length) {
            for (const search of req.data.searches) {
              found = search.search === req.query.search
              if (found) {
                break
              }
            }
          }
          if (!found) {
            req.data.searches.unshift({search: req.query.search})
          }
        } else {
          addDeleteSearchLink = false
        }
      }
    }
  }
  if (req.data && req.data.searches && req.data.searches.length) {
    doc.renderList(req.data.searches, 'search-item-template', 'searches')
    if (req.query && req.query.search && addDeleteSearchLink) {
      doc.renderTemplate(req.query, 'delete-search-item-template', 'searches')
    }
  } else {
    doc.removeElementById('searches')
  }
  if (messageTemplate) {
    doc.renderTemplate(null, messageTemplate, 'status-container')
  }
  return dashboard.Response.end(req, res, doc)
}

async function submitForm (req, res) {
  if (!req.body || !req.body.flickrid) {
    res.statusCode = 500
    return res.end()
  }
  const existing = await dashboard.Redis.hgetAsync('staging:index', req.body.flickrid)
  if (existing) {
    res.statusCode = 200
    return res.end()
  }
  const photo = JSON.parse(decodeURI(req.body.json))
  photo.zWidth = photo.o_width > photo.o_height ? 800 : 600
  photo.zHeight = photo.o_width > photo.o_height ? 600 : 800
  await dashboard.Redis.hsetAsync('staging:index', req.body.flickrid, encodeURI(JSON.stringify(photo)))
  await dashboard.Redis.lpushAsync('staging:list', req.body.flickrid)
  res.statusCode = 200
  return res.end()
}

async function dedupeResults (results) {
  if (!results || !results.length) {
    return results
  }
  // filter results
  const published = await dashboard.Redis.lrangeAsync('published:list', 0, -1)
  const staging = await dashboard.Redis.lrangeAsync('staging:list', 0, -1)
  const dupeList = published.concat(staging)
  for (const i in results) {
    if (dupeList.indexOf(results[i].id) > -1) {
      results.splice(i, 1)
      continue
    }
  }
  return results
}

async function searchFlickr (searchText) {
  const cached = await dashboard.Redis.hgetAsync('searches:index', searchText)
  if (cached) {
    return dedupeResults(JSON.parse(cached))
  }
  // photo id search
  let searchFlickrid
  try {
    searchFlickrid = parseInt(searchText, 10)
  } catch (error) {
  }
  if (searchFlickrid > 0) {
    const search = {
      photo_id: searchFlickrid,
      extras: 'o_dims, description, original_format, owner_name, geo, license, tags'
    }
    const getInfoAsync = util.promisify(flickr.photos.getInfo)
    let photo
    try {
      photo = await getInfoAsync(search)
      photo = photo.photo
    } catch (error) {
      throw error
    }
    if (!photo.o_width || !photo.o_height) {
      const getSizesAsync = util.promisify(flickr.photos.getSizes)
      let sizes
      try {
        sizes = await getSizesAsync({photo_id: searchFlickrid})
      } catch (error) {
        throw error
      }
      for (const size of sizes.sizes.size) {
        if (+size.width > +photo.o_width || !photo.o_width) {
          photo.o_width = size.width
          photo.o_height = size.height
        }
      }
    }
    return [{
      id: photo.id,
      url: `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_n.jpg`,
      width: photo.o_width,
      height: photo.o_height,
      nWidth: photo.o_width > photo.o_height ? 320 : 240,
      nHeight: photo.o_width > photo.o_height ? 240 : 320,
      json: encodeURI(JSON.stringify(photo))
    }]
  }
  // text search
  const search = {
    text: searchText,
    sort: 'date-posted-desc',
    license: [4, 5, 6],
    per_page: 500,
    extras: 'o_dims,description,owner_name,license,tags',
    safe_search: 1, // safe mode
    content_type: 1 // photos only
  }
  const photoSearch = util.promisify(flickr.photos.search)
  // const getSizesAsync = util.promisify(flickr.photos.getSizes)
  const results = await photoSearch(search)
  const photos = []
  if (!results || !results.photos || !results.photos.photo || !results.photos.photo.length) {
    return photos
  }
  for (const photo of results.photos.photo) {
    if (photo.license === '0') { // all rights reserved
      continue
    }
    /*
      if (!photo.o_width || !photo.o_height) {
        const sizes = await getSizesAsync({photo_id: photo.id})
        const largest = sizes.sizes.size[sizes.sizes.size.length - 1]
        photo.o_width = largest.width
        photo.o_height = largest.height
      }
    */
    if (!photo.o_width || !photo.o_height || photo.o_width < requiredWidth || photo.o_height < requiredHeight) {
      continue
    }
    // require title
    if (!photo.title || (!photo.title.substring && !photo.title._content)) {
      continue
    }
    // require description
    if (!photo.description || (!photo.description.substring && !photo.description._content)) {
      continue
    }
    // require photographer
    if (!photo.ownername && (!photo.owner || !photo.owner.realname)) {
      continue
    }
    const item = {
      id: photo.id,
      url: `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_n.jpg`,
      width: photo.o_width,
      height: photo.o_height,
      nWidth: photo.o_width > photo.o_height ? 320 : 240,
      nHeight: photo.o_width > photo.o_height ? 240 : 320,
      json: encodeURI(JSON.stringify(photo))
    }
    photos.push(item)
  }
  if (photos.length) {
    await dashboard.Redis.lpushAsync('searches:list', searchText)
    await dashboard.Redis.hsetAsync('searches:index', searchText, JSON.stringify(photos))
  }
  return dedupeResults(photos)
}
