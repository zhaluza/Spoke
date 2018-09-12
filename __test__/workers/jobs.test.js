import {getTimezoneByZip, assignTexters} from '../../src/workers/jobs'
import {r, Campaign, CampaignContact, JobRequest, Organization, User, ZipCode} from '../../src/server/models'
import {setupTest, cleanupTest} from "../test_helpers";


jest.mock('../../src/lib/zip-format')
var zipFormat = require('../../src/lib/zip-format')

describe('test getTimezoneByZip', () => {

  beforeAll(async () => await setupTest(), global.DATABASE_SETUP_TEARDOWN_TIMEOUT)
  afterAll(async () => await cleanupTest(), global.DATABASE_SETUP_TEARDOWN_TIMEOUT)

  it('returns timezone data from the common zipcode/timezone mappings', async () => {
    zipFormat.zipToTimeZone.mockReturnValueOnce([0, 0, 3, 1])

    var good_things_come_to_those_who_wait = await getTimezoneByZip('11790')
    expect(good_things_come_to_those_who_wait).toEqual('3_1')
  })

  it('does not memoize common zipcode/timezone mappings', async () => {
    zipFormat.zipToTimeZone.mockReturnValueOnce([0, 0, 4, 1])

    var future = await getTimezoneByZip('11790')
    expect(future).toEqual('4_1')
  })

  it('does not find a zipcode in the database!', async () => {
    zipFormat.zipToTimeZone.mockReturnValueOnce(undefined)

    var future = await getTimezoneByZip('11790')
    expect(future).toEqual('')
  })

  it('finds a zipcode in the database and memoizes it', async () => {
    zipFormat.zipToTimeZone.mockReturnValueOnce(undefined)

    try {
      var zipCode = new ZipCode({
        zip: '11790',
        city: 'Stony Brook',
        state: 'NY',
        timezone_offset: 7,
        has_dst: true,
        latitude: 0,
        longitude: 0
      })
      var future = await ZipCode.save(zipCode)
      expect(future).resolves

      future = await getTimezoneByZip('11790')
      expect(future).toEqual('7_1')

      future = await r.table('zip_code').getAll().delete()
      expect(future).resolves

      future = await r.table('zip_code').get('11790')
      expect(future).toEqual([])

      future = await getTimezoneByZip('11790')
      expect(future).toEqual('7_1')
    }
    finally {
      return await r.table('zip_code').getAll().delete()
    }


  })
})

// TODO
// 1. loadContacts with upload
// 2. loadContactsFromWarehouse (connect the db to the test db and use another campaign's contacts for input)
// 3. loadContactsFromWarehouse with > 10000 contacts for iteration
// 4. loadContactsFromWarehouse with > 10000 LIMIT clause which should error out and save job with error message
// 5. loadContactsFromWarehouse with = 30000 and check contact count


describe('test texter assignment in dynamic mode', async() => {
  
  beforeAll(async () => await setupTest(), global.DATABASE_SETUP_TEARDOWN_TIMEOUT)
  afterAll(async () => await cleanupTest(), global.DATABASE_SETUP_TEARDOWN_TIMEOUT)

  const organization = Organization.save({
    id: '1',
    texting_hours_enforced: false,
    texting_hours_start: 9,
    texting_hours_end: 14
  })

  const campaign = await Campaign.save({
    organization_id: organization.id,
    id: '1',
    use_dynamic_assignment: true
  })

  const contactInfo = ['1111111111','2222222222','3333333333','4444444444','5555555555']
  contactInfo.map((contact) => {
    CampaignContact.save({cell: contact, campaign_id: campaign.id})
  })

  const texterInfo = [
    {
      id: '1',
      auth0_id: 'aaa',
      first_name: 'Ruth',
      last_name: 'Bader',
      cell: '9999999999',
      email: 'rbg@example.com',
    },
    {
      id: '2',
      auth0_id: 'bbb',
      first_name: 'Elena',
      last_name: 'Kagan', 
      cell: '8888888888',
      email: 'ek@example.com'
    }
  ]
  texterInfo.map((texter) => {
    User.save({
      id: texter.id,
      auth0_id: texter.auth0_id,
      first_name: texter.first_name,
      last_name: texter.last_name,
      cell: texter.cell,
      email: texter.email
    })
  })

  it('assigns no contacts to texters with maxContacts set to 0', async() => {
    console.log('campaign', campaign)
    const payload = '{"id": "3","texters":[{"id":"1","needsMessageCount":0,"maxContacts":0,"contactsCount":0},{"id":"2","needsMessageCount":0,"maxContacts":0,"contactsCount":0}]}'
    const job = await JobRequest.save({
      campaign_id: campaign.id,
      payload: payload,
      queue_name: "3:edit_campaign", 
      job_type: 'assign_texters', 
    })
    await assignTexters(job)
    const assignedTextersCount = await r.knex('campaign_contact').where({campaign_id: 1}).count()
    expect(assignedTextersCount).toEqual(0)
  })

})