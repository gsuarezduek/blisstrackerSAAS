import Navbar from '../components/Navbar'
import ProductivityTab from '../components/admin/ProductivityTab'

export default function Productivity() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Productividad</h1>
        <ProductivityTab />
      </main>
    </div>
  )
}
