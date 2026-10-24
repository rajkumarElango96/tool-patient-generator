// Synthetic Indian seed data for the hospital simulator.
// Every name, number and address produced from this file is fictional.

const givenMale = [
  'Arjun', 'Karthik', 'Rahul', 'Vikram', 'Suresh', 'Ramesh', 'Anand', 'Prakash',
  'Manoj', 'Sanjay', 'Rohan', 'Aditya', 'Harish', 'Ganesh', 'Venkatesh', 'Imran',
  'Joseph', 'Abdul', 'Naveen', 'Sathish', 'Deepak', 'Mohan', 'Ravi', 'Kiran'
];

const givenFemale = [
  'Priya', 'Lakshmi', 'Anjali', 'Divya', 'Kavya', 'Meena', 'Sneha', 'Pooja',
  'Revathi', 'Shalini', 'Nandini', 'Deepa', 'Fathima', 'Mary', 'Asha', 'Geetha',
  'Swathi', 'Radha', 'Bhavana', 'Keerthana', 'Nisha', 'Uma', 'Sangeetha', 'Ayesha'
];

const familyNames = [
  'Kumar', 'Sharma', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Pillai', 'Menon', 'Patel',
  'Singh', 'Gupta', 'Das', 'Mukherjee', 'Krishnan', 'Subramanian', 'Naidu',
  'Joshi', 'Verma', 'Khan', 'Fernandes', 'Shetty', 'Hegde', 'Chatterjee', 'Bose'
];

// City, state and PIN prefix are kept together so addresses stay consistent.
const places = [
  { city: 'Chennai', state: 'Tamil Nadu', pin: '600' },
  { city: 'Coimbatore', state: 'Tamil Nadu', pin: '641' },
  { city: 'Madurai', state: 'Tamil Nadu', pin: '625' },
  { city: 'Bengaluru', state: 'Karnataka', pin: '560' },
  { city: 'Mysuru', state: 'Karnataka', pin: '570' },
  { city: 'Belagavi', state: 'Karnataka', pin: '590' },
  { city: 'Hyderabad', state: 'Telangana', pin: '500' },
  { city: 'Kochi', state: 'Kerala', pin: '682' },
  { city: 'Thiruvananthapuram', state: 'Kerala', pin: '695' },
  { city: 'Mumbai', state: 'Maharashtra', pin: '400' },
  { city: 'Pune', state: 'Maharashtra', pin: '411' },
  { city: 'New Delhi', state: 'Delhi', pin: '110' },
  { city: 'Lucknow', state: 'Uttar Pradesh', pin: '226' },
  { city: 'Kolkata', state: 'West Bengal', pin: '700' },
  { city: 'Dehradun', state: 'Uttarakhand', pin: '248' },
  { city: 'Jaipur', state: 'Rajasthan', pin: '302' },
  { city: 'Ahmedabad', state: 'Gujarat', pin: '380' }
];

const streets = [
  'Gandhi Road', 'Nehru Street', 'MG Road', 'Station Road', 'Temple Street',
  'Lake View Road', 'Market Road', 'Park Avenue', 'Church Street', 'Main Road',
  '2nd Cross Street', '4th Main Road', 'Anna Salai', 'Ring Road'
];

// Attending doctors: ID, family name, given name.
const doctors = [
  ['D1001', 'Raman', 'Sunita'], ['D1002', 'Bhatt', 'Arvind'], ['D1003', 'Menon', 'Leela'],
  ['D1004', 'Srinivasan', 'Gopal'], ['D1005', 'Qureshi', 'Farah'], ['D1006', 'Dsouza', 'Neil'],
  ['D1007', 'Chandra', 'Vani'], ['D1008', 'Kulkarni', 'Mahesh']
];

// Hospital service (PV1-10) with the wards that service uses (PV1-3 point of care).
const services = [
  { code: 'MED', name: 'General Medicine', wards: ['GENM', 'GENF'] },
  { code: 'SUR', name: 'General Surgery', wards: ['SURG'] },
  { code: 'CAR', name: 'Cardiology', wards: ['CCU', 'CARD'] },
  { code: 'ORT', name: 'Orthopaedics', wards: ['ORTH'] },
  { code: 'PED', name: 'Paediatrics', wards: ['PEDS'] },
  { code: 'OBS', name: 'Obstetrics', wards: ['MATY'] }
];

module.exports = { givenMale, givenFemale, familyNames, places, streets, doctors, services };
