#!/usr/bin/env node

/*
  Builds the preloads.js file by injecting the apiSpecs
  content into the raw preloads content
*/

const fs = require('fs')
const path = require('path')

const preloadsRawFile = path.join(__dirname, 'preloads-raw.js')
const preloadsRaw = fs.readFileSync(preloadsRawFile, 'utf8')

const specFile = path.join(__dirname, 'apiSpecs.js')
const specRaw = fs.readFileSync(specFile, 'utf8')

const exportsPattern = /exports\..*/g
const processedSpec = specRaw.replace(exportsPattern, '')

// Update this if new exports get added to the file
const injectionPoint = 'const { FUNCTION, EVENT, SETTING, makeEvent, spec } = require(\'./apiSpecs\')'
const preloadsFinal = preloadsRaw.replace(injectionPoint, processedSpec)

const preloadsFile = path.join(__dirname, 'preloads.js')

fs.writeFileSync(preloadsFile, preloadsFinal)
