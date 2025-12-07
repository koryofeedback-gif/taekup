
import React, { useState, useRef, useEffect } from 'react';
import type { WizardData } from '../../types';
import { COUNTRIES, LANGUAGES, COUNTRY_LANGUAGE_MAP } from '../../constants';
import { generateSlogan } from '../../services/geminiService';

interface Step1Props {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

export const Step1ClubInfo: React.FC<Step1Props> = ({ data, onUpdate }) => {
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSloganLoading, setIsSloganLoading] = useState(false);
  // State to manage adding class per location
  const [newClassName, setNewClassName] = useState<Record<number, string>>({});

  // Synchronize branch names array size when branch count changes
  useEffect(() => {
      const count = data.branches || 1;
      const currentNames = data.branchNames || [];
      const currentAddresses = data.branchAddresses || [];
      
      if (currentNames.length !== count || currentAddresses.length !== count) {
          const newNames = Array.from({ length: count }, (_, i) => currentNames[i] || (i === 0 ? 'Main Location' : `Location ${i + 1}`));
          const newAddresses = Array.from({ length: count }, (_, i) => currentAddresses[i] || '');
          onUpdate({ branchNames: newNames, branchAddresses: newAddresses });
      }
  }, [data.branches]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpdate({ logo: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleGenerateSlogan = async () => {
    setIsSloganLoading(true);
    const slogan = await generateSlogan(data.clubName);
    onUpdate({ slogan });
    setIsSloganLoading(false);
  }

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newCountry = e.target.value;
      const suggestedLanguage = COUNTRY_LANGUAGE_MAP[newCountry] || "English";
      onUpdate({ country: newCountry, language: suggestedLanguage });
  }

  const handleBranchNameChange = (index: number, newName: string) => {
      const oldName = data.branchNames[index];
      const newNames = [...(data.branchNames || [])];
      newNames[index] = newName;
      
      // If name changes, migrate the classes in location map
      const newLocationClasses = { ...data.locationClasses };
      
      if (newLocationClasses[oldName]) {
          newLocationClasses[newName] = newLocationClasses[oldName];
          delete newLocationClasses[oldName];
      }

      onUpdate({ branchNames: newNames, locationClasses: newLocationClasses });
  }

  const handleBranchAddressChange = (index: number, newAddress: string) => {
      const newAddresses = [...(data.branchAddresses || [])];
      newAddresses[index] = newAddress;
      onUpdate({ branchAddresses: newAddresses });
  }
  
  const handleAddClassToLocation = (locationIndex: number, locationName: string) => {
      const className = newClassName[locationIndex]?.trim();
      if (!className) return;

      const currentMap = data.locationClasses || {};
      const classesForLocation = currentMap[locationName] || [];
      
      const newMap = {
          ...currentMap,
          [locationName]: [...classesForLocation, className]
      };
      
      // Also update the flat global list for legacy/fallback compatibility
      const allUniqueClasses = Array.from(new Set([...(data.classes || []), className]));

      onUpdate({ locationClasses: newMap, classes: allUniqueClasses });
      setNewClassName(prev => ({ ...prev, [locationIndex]: '' }));
  }

  const handleRemoveClassFromLocation = (locationName: string, classIndex: number) => {
      const currentMap = { ...data.locationClasses };
      const classes = [...(currentMap[locationName] || [])];
      classes.splice(classIndex, 1);
      currentMap[locationName] = classes;
      onUpdate({ locationClasses: currentMap });
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white">
          Welcome to {data.clubName}!
        </h1>
        <p className="text-gray-400 mt-2">
            Let’s set up your TaekUp Dojang account, Master <span className={data.ownerName ? 'text-sky-300' : 'text-gray-500 italic'}>{data.ownerName || '(Your Name)'}</span>.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InputField id="clubName" label="Club Name" value={data.clubName} onChange={e => onUpdate({ clubName: e.target.value })} />
        <InputField id="ownerName" label="Owner Name" value={data.ownerName} onChange={e => onUpdate({ ownerName: e.target.value })} placeholder="e.g., Master Hamed"/>
        
        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-300">Country</label>
          <select id="country" value={data.country} onChange={handleCountryChange} className="mt-1 wizard-input">
            {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="language" className="block text-sm font-medium text-gray-300">Communication Language</label>
          <select id="language" value={data.language || 'English'} onChange={e => onUpdate({ language: e.target.value })} className="mt-1 wizard-input">
            {LANGUAGES.map(l => <option key={l}>{l}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">AI feedback will be generated in this language.</p>
        </div>

        <InputField id="city" label="City" value={data.city} onChange={e => onUpdate({ city: e.target.value })} />
        <InputField id="branches" label="Number of Branches / Locations" type="number" min="1" value={data.branches} onChange={e => onUpdate({ branches: parseInt(e.target.value, 10) })} />
        
        <div>
          <label className="block text-sm font-medium text-gray-300">Club Logo (Optional)</label>
          <div className="mt-1 flex items-center space-x-4">
              <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                )}
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-gray-600 hover:bg-gray-500 text-white text-sm font-bold py-2 px-4 rounded-md transition-colors">
                Upload
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
          </div>
        </div>
      </div>

      {/* Branch & Class Manager */}
      <div className="space-y-6 mt-4">
          <div className="flex items-center space-x-2 text-lg font-bold text-white border-b border-gray-700 pb-2">
              <span>📍</span>
              <h3>Locations & Classes</h3>
          </div>
          <p className="text-sm text-gray-400 -mt-4">
              Unlimited Locations. Add all your branches and satellite classes here.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.branchNames?.map((branchName, index) => (
                  <div key={index} className="bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-lg relative overflow-hidden">
                      {/* Location Settings Header */}
                      <div className="mb-4 space-y-3">
                          <div>
                              <label className="block text-xs text-sky-300 font-bold uppercase tracking-wider mb-1">Location {index + 1} Name</label>
                              <input 
                                  type="text" 
                                  value={branchName} 
                                  onChange={(e) => handleBranchNameChange(index, e.target.value)}
                                  className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white font-bold w-full focus:ring-2 focus:ring-sky-500 outline-none"
                                  placeholder="e.g. Downtown Dojang"
                              />
                          </div>
                          <div>
                              <label className="block text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Physical Address</label>
                              <input 
                                  type="text" 
                                  value={data.branchAddresses?.[index] || ''} 
                                  onChange={(e) => handleBranchAddressChange(index, e.target.value)}
                                  className="bg-gray-700/50 border border-gray-600 rounded px-3 py-2 text-white text-sm w-full focus:ring-2 focus:ring-sky-500 outline-none"
                                  placeholder="e.g. 123 Main St, City"
                              />
                          </div>
                      </div>

                      {/* Class List for this Location */}
                      <div className="bg-gray-700/30 p-3 rounded-md border border-gray-700">
                          <label className="block text-xs text-gray-400 mb-2">Classes at this location</label>
                          
                          {/* Add Class Input */}
                          <div className="flex space-x-2 mb-3">
                              <input 
                                  type="text" 
                                  value={newClassName[index] || ''} 
                                  onChange={(e) => setNewClassName(p => ({...p, [index]: e.target.value}))}
                                  onKeyDown={(e) => e.key === 'Enter' && handleAddClassToLocation(index, branchName)}
                                  placeholder="Class name (e.g. Tiny Tigers)"
                                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white w-full focus:outline-none focus:border-sky-500"
                              />
                              <button 
                                  onClick={() => handleAddClassToLocation(index, branchName)}
                                  className="bg-sky-500 hover:bg-sky-600 text-white px-3 rounded text-sm font-bold"
                              >
                                  +
                              </button>
                          </div>

                          {/* List of Classes */}
                          <div className="flex flex-wrap gap-2">
                              {(data.locationClasses?.[branchName] || []).map((cls, clsIdx) => (
                                  <div key={clsIdx} className="bg-gray-600 text-white px-2 py-1 rounded text-xs flex items-center">
                                      {cls}
                                      <button onClick={() => handleRemoveClassFromLocation(branchName, clsIdx)} className="ml-2 text-gray-400 hover:text-red-300 font-bold">&times;</button>
                                  </div>
                              ))}
                              {(!data.locationClasses?.[branchName] || data.locationClasses[branchName].length === 0) && (
                                  <span className="text-xs text-gray-500 italic">No classes added yet.</span>
                              )}
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      </div>
      
      <div>
        <label htmlFor="slogan" className="block text-sm font-medium text-gray-300">Slogan (Optional)</label>
        <div className="mt-1 flex items-center space-x-2">
            <input id="slogan" value={data.slogan} onChange={e => onUpdate({ slogan: e.target.value })} placeholder="e.g., Discipline. Focus. Spirit." className="wizard-input flex-1" />
            <button type="button" onClick={handleGenerateSlogan} disabled={isSloganLoading} className="bg-sky-500/50 hover:bg-sky-500/70 text-sm text-white font-semibold py-2 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center">
              {isSloganLoading ? (
                 <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
              ) : (
                <><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 2a1 1 0 00-1 1v1.111A4.011 4.011 0 003 7.5a4.5 4.5 0 006.874 4.126l.001.001.001.001a4.5 4.5 0 004.25 0l.001-.001.001-.001A4.5 4.5 0 0017 7.5a4.011 4.011 0 00-1-2.389V3a1 1 0 00-1-1H5zm8.5 6a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM5 6.5A2.5 2.5 0 105 4a2.5 2.5 0 000 2.5zM12 14a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" clipRule="evenodd" /></svg> Suggest</>
              )}
            </button>
        </div>
      </div>

       <style>{`
        .wizard-input {
            background-color: #374151; /* bg-gray-700 */
            border: 1px solid #4B5563; /* border-gray-600 */
            border-radius: 0.375rem; /* rounded-md */
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            padding: 0.5rem 0.75rem;
            color: white;
            width: 100%;
        }
        .wizard-input:focus {
            outline: none;
            border-color: #3B82F6; /* focus:border-sky-500 */
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5); /* focus:ring-sky-500 */
        }
       `}</style>
    </div>
  );
};

const InputField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; }> = ({ label, id, ...props }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-300">{label}</label>
    <input id={id} {...props} className="mt-1 wizard-input" />
  </div>
);
