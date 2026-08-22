/**
 * @typedef {'tabletka' | 'pachka' | 'shprits'} DosageUnit
 *
 * @typedef {Object} Branch
 * @property {string} id
 * @property {string} name
 * @property {string} address
 * @property {number} latitude
 * @property {number} longitude
 * @property {string} phone
 * @property {boolean} isActive
 * @property {string} [district]
 * @property {string} [workingHours]
 * @property {string} [city]
 *
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {string} iconName
 *
 * @typedef {Object} Medicine
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} dosage
 * @property {DosageUnit} dosageUnit
 * @property {boolean} isPrescription
 * @property {string} imageUrl
 * @property {string} categoryId
 * @property {number} price
 * @property {number} stockCount
 *
 * @typedef {Object} CartItem
 * @property {Medicine} medicine
 * @property {number} quantity
 * @property {string} branchId
 * @property {DosageUnit} selectedUnit
 *
 * @typedef {Object} Order
 * @property {string} id
 * @property {string} orderNumber
 * @property {string} branchId
 * @property {Array<{ medicineId: string, name?: string, quantity: number, unitPrice?: number, isPrescription?: boolean }>} items
 * @property {number} totalAmount
 * @property {string} status
 * @property {string} deliveryAddress
 * @property {string|null} prescriptionUrl
 * @property {string|null} cancelReason
 * @property {string} createdAt
 * @property {string} [reservedUntil]
 * @property {string} [customerName]
 * @property {string} [customerPhone]
 */

export {};
