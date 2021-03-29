const BaseModel = require('./base')
const { ValidationError } = require('objection')
const hashId = require('objection-hashid')
const scrape = require('../lib/scrape')

const { URL } = require('url')
const normalizeUrl = require('normalize-url')
const domain = new URL(process.env.BASE_URL).host

class Link extends hashId(BaseModel) {
  static get relationMappings() {
    return {
      creator: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: 'user',
        join: {
          from: 'links.creatorId',
          to: 'users.id'
        }
      }
    }
  }

  // process JSON from user input synchronously
  $parseJson(json, opt) {
    json = super.$parseJson(json, opt)

    if (json.hash) {
      // Since custom and auto-generated hash are both mounted under /,
      // we need to check that custom hash CAN'T clash with autogenerated hash.
      let ids
      try {
        ids = this.constructor._hashIdInstance.decode(json.hash)
      } catch (err) {} // when the hash contains "invalid" characters, we know for sure it CAN'T clash.
      if (ids && ids.length)
        throw new ValidationError('Cannot use hash ' + json.hash)
    }

    if (json.originalUrl) {
      try {
        // Normalize URL so that we can search by URL.
        // The process of normalization also involves validating the (normalized) URL.
        // When an invalid link is passed, it will throw.
        // Note that we do not have to worry about catching a specific error type,
        // or enriching the error object with any status codes,
        // since we catch all errors in this block - which are all input checks -
        // and re-throw them as validation errors.
        json.originalUrl = normalizeUrl(json.originalUrl, { forceHttps: true })

        if (new URL(json.originalUrl).host === domain)
          throw new Error(`Cannot shorten ${domain} URLs`)
      } catch (err) {
        throw new ValidationError(err)
      }
    }

    return json
  }

  async $beforeInsert(queryContext) {
    await super.$beforeInsert(queryContext)

    // update metadata by visiting the URL
    this.meta = Object.assign(await scrape(this.originalUrl), this.meta)
  }

  static get virtualAttributes() {
    return ['shortenedUrl', 'brandedUrl']
  }

  get shortenedUrl() {
    return `${process.env.BASE_URL}/${this.hashId}`
  }

  get brandedUrl() {
    return this.hash ? `${process.env.BASE_URL}/${this.hash}` : undefined
  }

  static get hashIdSalt() {
    return domain
  }

  static get hashIdMinLength() {
    return this.jsonSchema.properties.hash.minLength
  }

  static get QueryBuilder() {
    return class extends super.QueryBuilder {
      // if the hash is encoded, search for the id, else search hash directly
      findByHashId(hash) {
        const ids = this.modelClass()._hashIdInstance.decode(hash)

        return ids.length ? this.findById(ids[0]) : this.findOne({ hash })
      }
    }
  }
}

module.exports = Link
