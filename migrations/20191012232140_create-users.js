const tableName = 'users'

exports.up = knex =>
  knex.schema.createTable(tableName, table => {
    table.increments()
    table.text('role').notNullable()

    table.text('name')
    table.text('avatar')

    table.text('github_id').unique()
    table.text('slack_id').unique()

    table.timestamps(true, true)
  })

exports.down = knex => knex.schema.dropTable(tableName)
