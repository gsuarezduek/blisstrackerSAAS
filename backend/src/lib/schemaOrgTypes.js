// Jerarquía (parcial) de tipos de Schema.org, para no reportar como AUSENTE un schema
// que está puesto con un subtipo más específico.
//
// Caso real que lo motivó (mdzrentacar.com): el sitio declara `AutoRental`, que ES un
// LocalBusiness (y por lo tanto una Organization). Comparando por igualdad exacta contra
// 'Organization'/'LocalBusiness', el análisis concluía "no se detectó ningún schema de
// negocio" — y con eso se caía también la sección de NAP del prompt (nombre/teléfono/
// dirección salen de ese schema) y el generador proponía crear un LocalBusiness que ya
// existía. Usar el subtipo correcto es la práctica recomendada por Google, así que
// penalizarlo es exactamente al revés.
//
// No es la jerarquía completa de schema.org (son cientos de tipos): es la lista de los
// que aparecen en sitios de clientes. Agregar uno nuevo es sumarlo al set que corresponda.

// Subtipos de LocalBusiness (que a su vez es subtipo de Organization).
const LOCAL_BUSINESS_SUBTYPES = new Set([
  'AnimalShelter', 'ArchiveOrganization', 'AutomotiveBusiness', 'AutoBodyShop', 'AutoDealer',
  'AutoPartsStore', 'AutoRental', 'AutoRepair', 'AutoWash', 'GasStation', 'MotorcycleDealer',
  'MotorcycleRepair', 'ChildCare', 'Dentist', 'DryCleaningOrLaundry', 'EmergencyService',
  'EmploymentAgency', 'EntertainmentBusiness', 'AdultEntertainment', 'AmusementPark',
  'ArtGallery', 'Casino', 'ComedyClub', 'MovieTheater', 'NightClub', 'FinancialService',
  'AccountingService', 'AutomatedTeller', 'BankOrCreditUnion', 'InsuranceAgency',
  'FoodEstablishment', 'Bakery', 'BarOrPub', 'Brewery', 'CafeOrCoffeeShop', 'Distillery',
  'FastFoodRestaurant', 'IceCreamShop', 'Restaurant', 'Winery', 'GovernmentOffice',
  'PostOffice', 'HealthAndBeautyBusiness', 'BeautySalon', 'DaySpa', 'HairSalon',
  'HealthClub', 'NailSalon', 'TattooParlor', 'HomeAndConstructionBusiness', 'Electrician',
  'GeneralContractor', 'HVACBusiness', 'HousePainter', 'Locksmith', 'MovingCompany',
  'Plumber', 'RoofingContractor', 'InternetCafe', 'LegalService', 'Attorney', 'Notary',
  'Library', 'LodgingBusiness', 'BedAndBreakfast', 'Campground', 'Hostel', 'Hotel',
  'Motel', 'Resort', 'SkiResort', 'VacationRental', 'MedicalBusiness', 'Optician',
  'Pharmacy', 'Physician', 'ProfessionalService', 'RadioStation', 'RealEstateAgent',
  'RecyclingCenter', 'SelfStorage', 'ShoppingCenter', 'SportingGoodsStore',
  'SportsActivityLocation', 'BowlingAlley', 'ExerciseGym', 'GolfCourse', 'PublicSwimmingPool',
  'TennisComplex', 'Store', 'BikeStore', 'BookStore', 'ClothingStore', 'ComputerStore',
  'ConvenienceStore', 'DepartmentStore', 'ElectronicsStore', 'Florist', 'FurnitureStore',
  'GardenStore', 'GroceryStore', 'HardwareStore', 'HobbyShop', 'HomeGoodsStore',
  'JewelryStore', 'LiquorStore', 'MensClothingStore', 'MobilePhoneStore', 'MovieRentalStore',
  'MusicStore', 'OfficeEquipmentStore', 'OutletStore', 'PawnShop', 'PetStore', 'ShoeStore',
  'Supermarket', 'ToyStore', 'TelevisionStation', 'TouristInformationCenter', 'TravelAgency',
])

// Subtipos de Organization que NO son LocalBusiness.
const ORGANIZATION_SUBTYPES = new Set([
  'Airline', 'Consortium', 'Cooperative', 'Corporation', 'EducationalOrganization',
  'CollegeOrUniversity', 'ElementarySchool', 'HighSchool', 'MiddleSchool', 'Preschool',
  'School', 'FundingScheme', 'GovernmentOrganization', 'LibrarySystem', 'MedicalOrganization',
  'Dentist', 'DiagnosticLab', 'Hospital', 'VeterinaryCare', 'NGO', 'NewsMediaOrganization',
  'OnlineBusiness', 'OnlineStore', 'PerformingGroup', 'DanceGroup', 'MusicGroup',
  'TheaterGroup', 'PoliticalParty', 'Project', 'FundingAgency', 'ResearchOrganization',
  'ResearchProject', 'SearchRescueOrganization', 'SportsOrganization', 'SportsTeam',
  'WorkersUnion',
])

// Subtipos de Article.
const ARTICLE_SUBTYPES = new Set([
  'AdvertiserContentArticle', 'BlogPosting', 'LiveBlogPosting', 'DiscussionForumPosting',
  'NewsArticle', 'AnalysisNewsArticle', 'BackgroundNewsArticle', 'OpinionNewsArticle',
  'ReportageNewsArticle', 'ReviewNewsArticle', 'Report', 'SatiricalArticle',
  'ScholarlyArticle', 'MedicalScholarlyArticle', 'SocialMediaPosting', 'TechArticle',
  'APIReference',
])

// Subtipos de Product.
const PRODUCT_SUBTYPES = new Set([
  'Car', 'IndividualProduct', 'ProductCollection', 'ProductGroup', 'ProductModel',
  'SomeProducts', 'Vehicle', 'BusOrCoach', 'Motorcycle', 'MotorizedBicycle',
])

// Subtipos de CreativeWork que a efectos del análisis valen como WebPage.
const WEBPAGE_SUBTYPES = new Set([
  'AboutPage', 'CheckoutPage', 'CollectionPage', 'ContactPage', 'FAQPage', 'ItemPage',
  'MedicalWebPage', 'ProfilePage', 'QAPage', 'RealEstateListing', 'SearchResultsPage',
])

/**
 * Tipos que un `@type` implica, incluyéndose a sí mismo: `AutoRental` →
 * ['AutoRental', 'LocalBusiness', 'Organization'].
 */
function impliedTypes(type) {
  const t = String(type || '').trim()
  if (!t) return []
  const out = [t]
  if (LOCAL_BUSINESS_SUBTYPES.has(t)) out.push('LocalBusiness', 'Organization')
  else if (t === 'LocalBusiness') out.push('Organization')
  else if (ORGANIZATION_SUBTYPES.has(t)) out.push('Organization')
  if (ARTICLE_SUBTYPES.has(t)) out.push('Article', 'CreativeWork')
  if (PRODUCT_SUBTYPES.has(t)) out.push('Product')
  if (WEBPAGE_SUBTYPES.has(t)) out.push('WebPage')
  return [...new Set(out)]
}

/**
 * Expande una lista de `@type` detectados a todo lo que implican. Lo que se compara
 * contra "¿está este schema?" es SIEMPRE esta expansión, nunca la lista cruda.
 */
function expandTypes(types = []) {
  return new Set((Array.isArray(types) ? types : [types]).flatMap(impliedTypes))
}

/** ¿Los tipos detectados cubren `wanted`, directo o por subtipo? */
function hasSchemaType(types, wanted) {
  return expandTypes(types).has(wanted)
}

/** Los `wanted` que NO están cubiertos por los tipos detectados. */
function missingSchemaTypes(types, wanted = []) {
  const present = expandTypes(types)
  return wanted.filter(t => !present.has(t))
}

/** ¿Este nodo de JSON-LD es la entidad del negocio (Organization/LocalBusiness o subtipo)? */
function isOrgLikeSchema(node) {
  const raw = node?.['@type']
  const types = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  const expanded = expandTypes(types)
  return expanded.has('Organization') || expanded.has('LocalBusiness')
}

module.exports = {
  LOCAL_BUSINESS_SUBTYPES,
  ORGANIZATION_SUBTYPES,
  ARTICLE_SUBTYPES,
  PRODUCT_SUBTYPES,
  WEBPAGE_SUBTYPES,
  impliedTypes,
  expandTypes,
  hasSchemaType,
  missingSchemaTypes,
  isOrgLikeSchema,
}
