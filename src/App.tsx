import { useState, useEffect } from 'react';
import { Map } from './components/Map';
import shipLogo from './components/ShipLogo.svg';

// Types pour nos documents
type Document = {
  id: string;
  name: string;
  category: 'Identité' | 'Véhicule' | 'Assurance' | 'Autre';
  expirationDate: string;
};

// Couleurs pour les badges de catégories
const categoryColors: Record<string, string> = {
  'Identité': 'bg-blue-100 text-blue-800 border-blue-200',
  'Véhicule': 'bg-green-100 text-green-800 border-green-200',
  'Assurance': 'bg-purple-100 text-purple-800 border-purple-200',
  'Autre': 'bg-gray-100 text-gray-800 border-gray-200',
};

function App() {
  // État pour les onglets : 'documents' ou 'map'
  const [activeTab, setActiveTab] = useState<'documents' | 'map'>('documents');

  // État pour la gestion des documents
  const [documents, setDocuments] = useState<Document[]>([]);
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState<Document['category']>('Identité');
  const [newDocDate, setNewDocDate] = useState('');

  // Charger les documents au démarrage
  useEffect(() => {
    const saved = localStorage.getItem('maritrack-documents');
    if (saved) setDocuments(JSON.parse(saved));
  }, []);

  // Sauvegarder à chaque modification
  useEffect(() => {
    localStorage.setItem('maritrack-documents', JSON.stringify(documents));
  }, [documents]);

  // Ajouter un document
  const addDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName || !newDocDate) return;

    const newDoc: Document = {
      id: crypto.randomUUID(),
      name: newDocName,
      category: newDocCategory,
      expirationDate: newDocDate,
    };

    setDocuments([...documents, newDoc]);
    setNewDocName('');
    setNewDocDate('');
  };

  // Supprimer un document
  const deleteDocument = (id: string) => {
    setDocuments(documents.filter(doc => doc.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* En-tête principal */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <img src={shipLogo} alt="" aria-hidden="true" className="h-14 w-14 shrink-0" />
            <h1 className="text-3xl font-bold text-blue-900">Bess Sök</h1>
          </div>
          <p className="text-gray-500 mt-1">Gérez vos documents et suivez les ports & navires en temps réel</p>
        </div>
      </header>

      {/* Navigation par onglets */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 flex gap-8">
          <button
            onClick={() => setActiveTab('documents')}
            className={`py-4 px-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'documents'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            📁 Mes Documents
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`py-4 px-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'map'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🗺️ Carte Maritime
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        
        {/* VUE 1 : Gestion des documents */}
        {activeTab === 'documents' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Formulaire d'ajout */}
            <form onSubmit={addDocument} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4 text-gray-800">Ajouter un nouveau document</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input
                  type="text"
                  placeholder="Nom (ex: Passeport)"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <select
                  value={newDocCategory}
                  onChange={(e) => setNewDocCategory(e.target.value as Document['category'])}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="Identité">Identité</option>
                  <option value="Véhicule">Véhicule</option>
                  <option value="Assurance">Assurance</option>
                  <option value="Autre">Autre</option>
                </select>
                <input
                  type="date"
                  value={newDocDate}
                  onChange={(e) => setNewDocDate(e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                >
                  + Ajouter
                </button>
              </div>
            </form>

            {/* Liste des documents */}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Mes documents ({documents.length})
              </h2>
              
              {documents.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                  <p className="text-gray-500">Aucun document pour le moment. Ajoutez-en un ci-dessus !</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => {
                    const daysLeft = Math.ceil((new Date(doc.expirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    let statusColor = 'border-green-500';
                    let statusText = `${daysLeft} jours restants`;
                    let textColor = 'text-green-600';
                    
                    if (daysLeft < 0) {
                      statusColor = 'border-red-500';
                      statusText = 'Expiré !';
                      textColor = 'text-red-600';
                    } else if (daysLeft <= 30) {
                      statusColor = 'border-orange-500';
                      statusText = `Expire dans ${daysLeft} jours`;
                      textColor = 'text-orange-600';
                    }

                    return (
                      <div key={doc.id} className={`bg-white p-4 rounded-xl shadow-sm border-l-4 ${statusColor} flex justify-between items-center hover:shadow-md transition-shadow`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${categoryColors[doc.category]}`}>
                              {doc.category}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">Expire le : {new Date(doc.expirationDate).toLocaleDateString('fr-FR')}</p>
                          <p className={`text-sm font-semibold mt-1 ${textColor}`}>
                            {statusText}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteDocument(doc.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors ml-4"
                        >
                          Supprimer
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VUE 2 : Carte Maritime */}
        {activeTab === 'map' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Map />
          </div>
        )}

      </main>
    </div>
  );
}

export default App;