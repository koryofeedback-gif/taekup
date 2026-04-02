
import React, { useState, useRef, useEffect } from 'react';
import type { WizardData, WizardClassSchedule } from '../../types';
import { COUNTRIES, LANGUAGES, COUNTRY_LANGUAGE_MAP } from '../../constants';
import { generateSlogan } from '../../services/geminiService';
import { useTranslation } from '../../i18n/useTranslation';

interface Step1Props {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const emptyDraft = (): Omit<WizardClassSchedule, 'id'> => ({
    name: '',
    days: [],
    startTime: '17:00',
    endTime: '18:00',
    beltRequirement: 'All Belts',
    capacity: 20,
});

export const Step1ClubInfo: React.FC<Step1Props> = ({ data, onUpdate }) => {
  const { t } = useTranslation(data.language);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSloganLoading, setIsSloganLoading] = useState(false);

  const [drafts, setDrafts] = useState<Record<number, Omit<WizardClassSchedule, 'id'>>>({});
  const [showForm, setShowForm] = useState<Record<number, boolean>>({});

  useEffect(() => {
      const count = data.branches || 1;
      const currentNames = data.branchNames || [];
      const currentAddresses = data.branchAddresses || [];
      
      if (currentNames.length !== count || currentAddresses.length !== count) {
          const newNames = Array.from({ length: count }, (_, i) => currentNames[i] || (i === 0 ? t('wizard.step1.mainLocation') : t('wizard.step1.locationN').replace('{n}', String(i + 1))));
          const newAddresses = Array.from({ length: count }, (_, i) => currentAddresses[i] || '');
          onUpdate({ branchNames: newNames, branchAddresses: newAddresses });
      }
  }, [data.branches, data.language]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setLogoPreview(dataUrl);
        onUpdate({ logo: dataUrl });
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
      
      const newLocationClasses = { ...data.locationClasses };
      const newLocationClassSchedules = { ...(data.locationClassSchedules || {}) };
      
      if (newLocationClasses[oldName]) {
          newLocationClasses[newName] = newLocationClasses[oldName];
          delete newLocationClasses[oldName];
      }
      if (newLocationClassSchedules[oldName]) {
          newLocationClassSchedules[newName] = newLocationClassSchedules[oldName];
          delete newLocationClassSchedules[oldName];
      }

      onUpdate({ branchNames: newNames, locationClasses: newLocationClasses, locationClassSchedules: newLocationClassSchedules });
  }

  const handleBranchAddressChange = (index: number, newAddress: string) => {
      const newAddresses = [...(data.branchAddresses || [])];
      newAddresses[index] = newAddress;
      onUpdate({ branchAddresses: newAddresses });
  }

  const getDraft = (idx: number) => drafts[idx] || emptyDraft();

  const setDraft = (idx: number, patch: Partial<Omit<WizardClassSchedule, 'id'>>) => {
      setDrafts(prev => ({ ...prev, [idx]: { ...getDraft(idx), ...patch } }));
  }

  const toggleDay = (idx: number, day: string) => {
      const current = getDraft(idx).days;
      const updated = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
      setDraft(idx, { days: updated });
  }

  const handleAddClass = (locationIndex: number, locationName: string) => {
      const draft = getDraft(locationIndex);
      if (!draft.name.trim() || draft.days.length === 0) return;

      const newClass: WizardClassSchedule = {
          id: `cls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: draft.name.trim(),
          days: draft.days,
          startTime: draft.startTime,
          endTime: draft.endTime,
          beltRequirement: draft.beltRequirement || 'All Belts',
          capacity: draft.capacity || 20,
      };

      const currentSchedules = { ...(data.locationClassSchedules || {}) };
      currentSchedules[locationName] = [...(currentSchedules[locationName] || []), newClass];

      const currentFlatClasses = { ...data.locationClasses };
      const flatForLoc = currentFlatClasses[locationName] || [];
      if (!flatForLoc.includes(newClass.name)) {
          currentFlatClasses[locationName] = [...flatForLoc, newClass.name];
      }
      const allUniqueClasses = Array.from(new Set([...(data.classes || []), newClass.name]));

      onUpdate({
          locationClassSchedules: currentSchedules,
          locationClasses: currentFlatClasses,
          classes: allUniqueClasses,
      });

      setDrafts(prev => ({ ...prev, [locationIndex]: emptyDraft() }));
      setShowForm(prev => ({ ...prev, [locationIndex]: false }));
  }

  const handleRemoveClass = (locationName: string, classId: string) => {
      const currentSchedules = { ...(data.locationClassSchedules || {}) };
      const removedName = currentSchedules[locationName]?.find(c => c.id === classId)?.name;
      currentSchedules[locationName] = (currentSchedules[locationName] || []).filter(c => c.id !== classId);

      const currentFlatClasses = { ...data.locationClasses };
      if (removedName) {
          currentFlatClasses[locationName] = (currentFlatClasses[locationName] || []).filter(n => n !== removedName);
      }

      onUpdate({ locationClassSchedules: currentSchedules, locationClasses: currentFlatClasses });
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white break-words">
          {t('wizard.step1.welcome')}
        </h1>
        <p className="text-gray-400 mt-2 break-words">
            {data.clubName} — {data.ownerName || ''}
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InputField id="clubName" label={t('wizard.step1.clubName')} value={data.clubName} onChange={e => onUpdate({ clubName: e.target.value })} />
        <InputField id="ownerName" label={t('wizard.step1.ownerName')} value={data.ownerName} onChange={e => onUpdate({ ownerName: e.target.value })} placeholder={t('wizard.step1.ownerPlaceholder')}/>
        
        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-300">{t('wizard.step1.country')}</label>
          <select id="country" value={data.country} onChange={handleCountryChange} className="mt-1 wizard-input">
            {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="language" className="block text-sm font-medium text-gray-300">{t('wizard.step1.language')}</label>
          <select id="language" value={data.language || 'English'} onChange={e => onUpdate({ language: e.target.value })} className="mt-1 wizard-input">
            {LANGUAGES.map(l => <option key={l}>{l}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1 break-words">{t('wizard.step1.languageHint')}</p>
        </div>

        <InputField id="city" label={t('wizard.step1.city')} value={data.city} onChange={e => onUpdate({ city: e.target.value })} />
        <InputField id="branches" label={t('wizard.step1.branches')} type="number" min="1" value={data.branches} onChange={e => onUpdate({ branches: parseInt(e.target.value, 10) })} />
        
        <div>
          <label className="block text-sm font-medium text-gray-300">{t('wizard.step1.logo')}</label>
          <div className="mt-1 flex items-center space-x-4">
              <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                {logoPreview ? (
                  <img src={logoPreview} alt={t('wizard.step1.logoPreview')} className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                )}
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-gray-600 hover:bg-gray-500 text-white text-sm font-bold py-2 px-4 rounded-md transition-colors">
                {t('wizard.step1.upload')}
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
          </div>
        </div>
      </div>

      <div className="space-y-6 mt-4">
          <div className="flex items-center space-x-2 text-lg font-bold text-white border-b border-gray-700 pb-2">
              <span>📍</span>
              <h3>{t('wizard.step1.locations')} & {t('wizard.step1.classes')}</h3>
          </div>
          <p className="text-sm text-gray-400 -mt-4 break-words">
              {t('wizard.step1.unlimitedLocations')}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.branchNames?.map((branchName, index) => {
                  const scheduledClasses = data.locationClassSchedules?.[branchName] || [];
                  const draft = getDraft(index);
                  const isOpen = showForm[index] || false;

                  return (
                      <div key={index} className="bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-lg">
                          <div className="mb-4 space-y-3">
                              <div>
                                  <label className="block text-xs text-sky-300 font-bold uppercase tracking-wider mb-1">{t('wizard.step1.locationName')} {index + 1}</label>
                                  <input
                                      type="text"
                                      value={branchName}
                                      onChange={(e) => handleBranchNameChange(index, e.target.value)}
                                      className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white font-bold w-full focus:ring-2 focus:ring-sky-500 outline-none"
                                      placeholder={t('wizard.step1.locationPlaceholder')}
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">{t('wizard.step1.address')}</label>
                                  <input
                                      type="text"
                                      value={data.branchAddresses?.[index] || ''}
                                      onChange={(e) => handleBranchAddressChange(index, e.target.value)}
                                      className="bg-gray-700/50 border border-gray-600 rounded px-3 py-2 text-white text-sm w-full focus:ring-2 focus:ring-sky-500 outline-none"
                                      placeholder={t('wizard.step1.addressPlaceholder')}
                                  />
                              </div>
                          </div>

                          <div className="bg-gray-700/30 p-3 rounded-md border border-gray-700 space-y-3">
                              <div className="flex items-center justify-between">
                                  <label className="text-xs text-gray-400 font-bold uppercase tracking-wider">Classes</label>
                                  <button
                                      onClick={() => setShowForm(prev => ({ ...prev, [index]: !isOpen }))}
                                      className="text-xs bg-sky-600 hover:bg-sky-500 text-white px-3 py-1 rounded font-bold transition-colors"
                                  >
                                      {isOpen ? '✕ Cancel' : '+ Add Class'}
                                  </button>
                              </div>

                              {isOpen && (
                                  <div className="bg-gray-900 border border-gray-600 rounded-lg p-3 space-y-3 animate-fadeIn">
                                      <div>
                                          <label className="block text-xs text-gray-400 mb-1">Class Name</label>
                                          <input
                                              type="text"
                                              value={draft.name}
                                              onChange={e => setDraft(index, { name: e.target.value })}
                                              placeholder="e.g. Kids Taekwondo"
                                              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-sky-500"
                                              autoFocus
                                          />
                                      </div>

                                      <div>
                                          <label className="block text-xs text-gray-400 mb-2">Days of the Week</label>
                                          <div className="flex flex-wrap gap-1.5">
                                              {DAYS_OF_WEEK.map((day, di) => {
                                                  const active = draft.days.includes(day);
                                                  return (
                                                      <button
                                                          key={day}
                                                          type="button"
                                                          onClick={() => toggleDay(index, day)}
                                                          className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${
                                                              active
                                                                  ? 'bg-sky-500 border-sky-400 text-white'
                                                                  : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-sky-500 hover:text-white'
                                                          }`}
                                                      >
                                                          {DAY_SHORT[di]}
                                                      </button>
                                                  );
                                              })}
                                          </div>
                                          {draft.days.length === 0 && (
                                              <p className="text-xs text-amber-400 mt-1">Select at least one day</p>
                                          )}
                                      </div>

                                      <div className="grid grid-cols-2 gap-3">
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Start Time</label>
                                              <input
                                                  type="time"
                                                  value={draft.startTime}
                                                  onChange={e => setDraft(index, { startTime: e.target.value })}
                                                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-sky-500"
                                              />
                                          </div>
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">End Time</label>
                                              <input
                                                  type="time"
                                                  value={draft.endTime}
                                                  onChange={e => setDraft(index, { endTime: e.target.value })}
                                                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-sky-500"
                                              />
                                          </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-3">
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Belt Level</label>
                                              <select
                                                  value={draft.beltRequirement || 'All Belts'}
                                                  onChange={e => setDraft(index, { beltRequirement: e.target.value })}
                                                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-sky-500"
                                              >
                                                  <option value="All Belts">All Belts</option>
                                                  {(data.belts || []).map(b => (
                                                      <option key={b.id} value={b.name}>{b.name}</option>
                                                  ))}
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Capacity</label>
                                              <input
                                                  type="number"
                                                  min="1"
                                                  max="200"
                                                  value={draft.capacity || 20}
                                                  onChange={e => setDraft(index, { capacity: parseInt(e.target.value, 10) || 20 })}
                                                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-sky-500"
                                              />
                                          </div>
                                      </div>

                                      <button
                                          onClick={() => handleAddClass(index, branchName)}
                                          disabled={!draft.name.trim() || draft.days.length === 0}
                                          className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold py-2 rounded transition-colors"
                                      >
                                          Add Class to Schedule
                                      </button>
                                  </div>
                              )}

                              {scheduledClasses.length === 0 && !isOpen ? (
                                  <p className="text-xs text-gray-500 italic text-center py-2">No classes yet — click &quot;+ Add Class&quot; to build your schedule</p>
                              ) : (
                                  <div className="space-y-2">
                                      {scheduledClasses.map(cls => (
                                          <div key={cls.id} className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 flex items-start justify-between gap-2">
                                              <div className="min-w-0">
                                                  <p className="text-sm font-semibold text-white truncate">{cls.name}</p>
                                                  <p className="text-xs text-sky-400 mt-0.5">
                                                      {cls.days.map(d => d.slice(0, 3)).join(' · ')}
                                                      {' · '}
                                                      {cls.startTime} – {cls.endTime}
                                                  </p>
                                                  <div className="flex gap-2 mt-1">
                                                      <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{cls.beltRequirement || 'All Belts'}</span>
                                                      <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">Max {cls.capacity || 20}</span>
                                                  </div>
                                              </div>
                                              <button
                                                  onClick={() => handleRemoveClass(branchName, cls.id)}
                                                  className="text-gray-500 hover:text-red-400 flex-shrink-0 mt-0.5 transition-colors"
                                              >
                                                  ✕
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      </div>
                  );
              })}
          </div>
      </div>
      
      <div>
        <label htmlFor="slogan" className="block text-sm font-medium text-gray-300">{t('wizard.step1.slogan')}</label>
        <div className="mt-1 flex items-center space-x-2">
            <input id="slogan" value={data.slogan} onChange={e => onUpdate({ slogan: e.target.value })} placeholder={t('wizard.step1.sloganPlaceholder')} className="wizard-input flex-1" />
            <button type="button" onClick={handleGenerateSlogan} disabled={isSloganLoading} className="bg-sky-500/50 hover:bg-sky-500/70 text-sm text-white font-semibold py-2 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center">
              {isSloganLoading ? (
                 <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
              ) : (
                <><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 2a1 1 0 00-1 1v1.111A4.011 4.011 0 003 7.5a4.5 4.5 0 006.874 4.126l.001.001.001.001a4.5 4.5 0 004.25 0l.001-.001.001-.001A4.5 4.5 0 0017 7.5a4.011 4.011 0 00-1-2.389V3a1 1 0 00-1-1H5zm8.5 6a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM5 6.5A2.5 2.5 0 105 4a2.5 2.5 0 000 2.5zM12 14a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" clipRule="evenodd" /></svg> {t('wizard.step1.suggest')}</>
              )}
            </button>
        </div>
      </div>

       <style>{`
        .wizard-input {
            background-color: #374151;
            border: 1px solid #4B5563;
            border-radius: 0.375rem;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            padding: 0.5rem 0.75rem;
            color: white;
            width: 100%;
        }
        .wizard-input:focus {
            outline: none;
            border-color: #3B82F6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.15s ease-out; }
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
