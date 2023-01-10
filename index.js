require('dotenv').config()

const express = require('express')
const mysql = require('mysql2')
const bodyParser = require('body-parser')
const cors = require('cors')

const app = express()

// Replace with your MySQL connection details
const connection = mysql.createConnection({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	port: 3306,
})

const checkAndCreateDb = async (dbConfig) => {
	const connection = mysql.createConnection({
		host: dbConfig.host,
		user: dbConfig.user,
		password: dbConfig.password,
	})
	try {
		const [results] = await connection
			.promise()
			.query(`SHOW DATABASES LIKE '${dbConfig.database}'`)
		if (results.length === 0) {
			await connection.promise().query(`CREATE DATABASE ${dbConfig.database}`)
		}
		//connect to the created database
		connection.promise().query(`USE ${dbConfig.database}`)

		// check if the table already exists
		const [tableExists] = await connection
			.promise()
			.query(
				`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${dbConfig.database}' AND table_name = 'products'`
			)

		if (tableExists[0]['COUNT(*)'] === 0) {
			//create table
			await connection.promise().query(`CREATE TABLE products (
           sku INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
           name VARCHAR(255) NOT NULL,
           price DECIMAL(10,2) NOT NULL,
           type ENUM("dvd","furniture","book") NOT NULL,
           size INT(11) DEFAULT NULL,
           dimensions VARCHAR(255) DEFAULT NULL,
           weight INT(11) DEFAULT NULL
           )`)
		}
	} catch (err) {
		console.log('Error: ', err)
	}
}

checkAndCreateDb({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
})

connection.connect((error) => {
	if (error) {
		console.error(error)
	} else {
		console.log('MySQL connected')
	}
})

// Abstract class for Product
class Product {
	constructor(sku, name, price, type) {
		this.sku = sku
		this.name = name
		this.price = price
		this.type = type
	}
}

// DVD class that extends Product
class DVD extends Product {
	constructor(sku, name, price, size, type) {
		super(sku, name, price, type)
		this.size = size
	}
}

// Furniture class that extends Product
class Furniture extends Product {
	constructor(sku, name, price, dimensions, type) {
		super(sku, name, price, type)
		this.dimensions = dimensions
	}
}

// Book class that extends Product
class Book extends Product {
	constructor(sku, name, price, weight, type) {
		super(sku, name, price, type)
		this.weight = weight
	}
}

// Helper function to create a product object from a MySQL row
const createProductFromRow = (row) => {
	switch (row.type) {
		case 'dvd':
			return new DVD(row.sku, row.name, row.price, row.size, row.type)
		case 'furniture':
			return new Furniture(
				row.sku,
				row.name,
				row.price,
				row.dimensions,
				row.type
			)
		case 'book':
			return new Book(row.sku, row.name, row.price, row.weight, row.type)
		default:
			return new Product(row.sku, row.name, row.price, row.type)
	}
}

app.use(bodyParser.json())
app.use(
	cors({
		origin: '*',
		methods: ['GET', 'POST', 'DELETE'],
		allowedHeaders: ['Content-Type', 'Authorization'],
	})
)

// Endpoint to retrieve all products

app.get('/products', (req, res) => {
	connection.query('SELECT * FROM products', (error, rows) => {
		if (error) {
			console.error(error)
			res.status(500).send({ error: 'Error retrieving products' })
		} else {
			const products = rows.map(createProductFromRow)
			res.send(products)
		}
	})
})

app.post('/products', (req, res) => {
	// Parse request body
	const { sku, name, price, type, size, weight, dimensions } = req.body

	// Construct product object
	let product
	switch (type) {
		case 'dvd':
			product = new DVD(sku, name, price, size, type)
			break
		case 'furniture':
			product = new Furniture(sku, name, price, dimensions, type)
			break
		case 'book':
			product = new Book(sku, name, price, weight, type)
			break
		default:
			return res.status(400).send({ error: `Invalid product type: ${type}` })
	}
	connection.query(
		'INSERT INTO products SET ?',
		{
			type: type,
			...product,
		},
		(error) => {
			if (error) {
				console.error(error)
				res.sendStatus(500)
			} else {
				res.send({
					product: {
						type: type,
						...product,
					},
				})
			}
		}
	)
})

app.delete('/products', (req, res) => {
	const skus = req.query.skus.split(',')

	connection.query('DELETE FROM products WHERE sku IN (?)', [skus], (error) => {
		if (error) {
			console.error(error)
			res.sendStatus(500)
		} else {
			res.send({ success: true })
		}
	})
})

app.listen(process.env.PORT || 8000, () => {
	console.log('Server listening...')
})
