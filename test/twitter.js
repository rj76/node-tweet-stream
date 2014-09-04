var assert = require('assert')
  , Twitter = require('../')
  , nock = require('nock')
  , Readable = require('stream').Readable

describe('twitter', function () {
  var twitter

  beforeEach(function () {
    twitter = new Twitter({
      consumer_key: 'key',
      consumer_secret: 'secret',
      token: 'token',
      token_secret: 'tokenSecret'
    })
  })

  it('fails if creds not received', function () {
    assert.throws(function () { new Twitter({}) }, Error)
  })

  it('emits reconnect', function (done) {
    twitter.on('reconnect', function (obj) {
      assert(obj)
      assert(obj.err.message)
      assert(obj.err.message.match(/401/)) // Bad twitter oauth credentials
      done()
    })
    twitter.track('tacos')
  })

  describe('tracking', function () {
    beforeEach(function () {
      nock('https://stream.twitter.com')
                  .post('/1.1/statuses/filter.json', {
                    track: 'tacos',
                    locations: '',
                    follow: ''
                  })
                  .replyWithFile(200, __dirname + '/tacos.json')

      nock('https://stream.twitter.com')
                  .post('/1.1/statuses/filter.json', {
                    track: 'tacos,tortas',
                    locations: '',
                    follow: ''
                  })
                  .replyWithFile(200, __dirname + '/tacos.json')
    })

    it('handles chunks', function (done) {
      nock('https://stream.twitter.com')
                  .post('/1.1/statuses/filter.json', {
                    track: 'chunks',
                    locations: '',
                    follow: ''
                  })
                  .reply(200, function (uri, body) {
                    var rs = new Readable
                      , calls = 0
                    rs._read = function () {
                      if (++calls === 1) {
                        rs.push('{"text":')
                      } else {
                        rs.push('"taco"}\r\n')
                        rs.push(null)
                      }
                    }
                    return rs
                  })

      twitter.on('tweet', function (tweet) {
        done()
      })
      twitter.track('chunks')
    })

    it('prevents a reconnect', function () {
      var called = false
      twitter.reconnect = function () {
        called = true
      }
      twitter.track('tacos', false)
      assert.deepEqual(twitter.tracking(), ['tacos'])
      assert(!called)
    })

    it('emits tweets', function (done) {
      twitter.on('tweet', function (tweet) {
        assert.equal(tweet.text, 'Taco')
        done()
      })

      assert(!twitter.stream)
      twitter.track('tacos')
      assert.deepEqual(twitter.tracking(), ['tacos'])
    })

    it('tracks dups of same keyword', function () {
      assert(!twitter.stream)
      twitter.track('tacos')
      twitter.track('tacos')
      twitter.track('tortas')
      assert.equal(twitter._filters.tracking.tacos, 2)
      assert.equal(twitter._filters.tracking.tortas, 1)
      assert.deepEqual(twitter.tracking(), ['tacos', 'tortas'])
      twitter.untrack('tacos')
      assert.equal(twitter._filters.tracking.tacos, 1)
      assert.deepEqual(twitter.tracking(), ['tacos', 'tortas'])
      twitter.track('tacos')
      assert.equal(twitter._filters.tracking.tacos, 2)
      assert.deepEqual(twitter.tracking(), ['tacos', 'tortas'])
    })

    it('avoids dups in tracking stream', function () {
      var called = 0
      twitter.reconnect = function () {
        called++
      }

      assert(!twitter.stream)
      twitter.track('tacos')
      twitter.track('tacos')
      twitter.track('tacos')
      assert.deepEqual(twitter.tracking(), ['tacos'])
      assert(called, 3)
    })

    it('closes connection if tracking is empty', function (done) {
      twitter.abort = function () {
        assert.deepEqual(twitter.tracking(), [])
        done()
      }

      assert(!twitter.stream)
      twitter.track('tacos')
      assert.deepEqual(twitter.tracking(), ['tacos'])
      twitter.untrack('tacos')
    })
  })

  describe('Location filters', function () {
      beforeEach(function () {
        nock('https://stream.twitter.com')
                    .post('/1.1/statuses/filter.json', {
                      track: '',
                      locations: '123,123',
                      follow: ''
                    })
                    .replyWithFile(200, __dirname + '/tacos.json')

        nock('https://stream.twitter.com')
                    .post('/1.1/statuses/filter.json', {
                      track: '',
                      locations: '123,123,321,321',
                      follow: ''
                    })
                    .replyWithFile(200, __dirname + '/tacos.json')
      })



    it('tracks dups of same location', function () {
      assert(!twitter.stream)
      twitter.location('123,123')
      twitter.location('123,123')
      twitter.location('321,321')
      assert.equal(twitter._filters.location['123,123'], 2)
      assert.equal(twitter._filters.location['321,321'], 1)
      assert.deepEqual(twitter.locations(), ['123,123', '321,321'])
      twitter.unlocate('123,123')
      assert.equal(twitter._filters.location['123,123'], 1)
      assert.deepEqual(twitter.locations(), ['123,123', '321,321'])
      twitter.location('123,123')
      assert.equal(twitter._filters.location['123,123'], 2)
      assert.deepEqual(twitter.locations(), ['123,123', '321,321'])
    })

    it('avoids dups of locations in the stream request', function () {
      var called = 0
      twitter.reconnect = function () {
        called++
      }

      assert(!twitter.stream)
      twitter.location('123,123')
      twitter.location('123,123')
      twitter.location('123,123')
      assert.deepEqual(twitter.locations(), ['123,123'])
      assert(called, 3)
    })

    it('closes connection if locations is empty', function (done) {
      twitter.abort = function () {
        assert.deepEqual(twitter.locations(), [])
        done()
      }

      assert(!twitter.stream)
      twitter.location('123,123')
      assert.deepEqual(twitter.locations(), ['123,123'])
      twitter.unlocate('123,123')
    })
  })

  describe('follow filters', function () {
    beforeEach(function () {
      nock('https://stream.twitter.com')
                  .post('/1.1/statuses/filter.json', {
                    track: '',
                    locations: '',
                    follow: '12345'
                  })
                  .replyWithFile(200, __dirname + '/tacos.json')

      nock('https://stream.twitter.com')
                  .post('/1.1/statuses/filter.json', {
                    track: '',
                    locations: '',
                    follow: '12345,123456'
                  })
                  .replyWithFile(200, __dirname + '/tacos.json')
    })

    it('tracks dups of same user', function () {
      assert(!twitter.stream)
      twitter.follow('12345')
      twitter.follow('12345')
      twitter.follow('123456')
      assert.equal(twitter._filters.follow['12345'], 2)
      assert.equal(twitter._filters.follow['123456'], 1)
      assert.deepEqual(twitter.following(), ['12345', '123456'])
      twitter.unfollow('12345')
      assert.equal(twitter._filters.follow['12345'], 1)
      assert.deepEqual(twitter.following(), ['12345', '123456'])
      twitter.follow('12345')
      assert.equal(twitter._filters.follow['12345'], 2)
      assert.deepEqual(twitter.following(), ['12345', '123456'])
    })

    it('avoids dups of users in the stream request', function () {
      var called = 0
      twitter.reconnect = function () {
        called++
      }

      assert(!twitter.stream)
      twitter.follow('12345')
      twitter.follow('12345')
      twitter.follow('12345')
      assert.deepEqual(twitter.following(), ['12345'])
      assert(called, 3)
    })

    it('closes connection if following is empty', function (done) {
      twitter.abort = function () {
        assert.deepEqual(twitter.following(), [])
        done()
      }

      assert(!twitter.stream)
      twitter.follow('12345')
      assert.deepEqual(twitter.following(), ['12345'])
      twitter.unfollow('12345')
    })
  })
})
