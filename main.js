// initialize the flickr API
require('./backend/administrator/puzzleboss/search.js')

// start dashboard
const dashboard = require('@userappstore/dashboard')
dashboard.start(__dirname)

// download all the pics from the old bucket
const AWS = require('aws-sdk')
const fs = require('fs')
const path = require('path')
const S3 = new AWS.S3()

async function upload () {
  // index
  console.log('puzzles.txt')
  await S3.putObject({
    Bucket: process.env.BUCKET_NAME,
    Key: 'public/puzzles.txt',
    Body: fs.readFileSync(path.join(__dirname, '/s3/public/puzzles.txt')),
    ContentType: 'binary',
    ContentEncoding: 'text/plain'
  }).promise()
  // photos
  const images = fs.readdirSync(path.join(__dirname, '/s3/public/puzzles/'))
  for (const image of images) {
    console.log(image)
    await S3.putObject({
      Bucket: process.env.BUCKET_NAME,
      Key: `public/puzzles/${image}`,
      Body: fs.readFileSync(path.join(__dirname, `/s3/public/puzzles/${image}`)),
      ContentType: 'binary',
      ContentEncoding: 'image/jpeg'
    }).promise()
  }
}

upload()
