
import React, { useState, useRef } from 'react';
import type { WizardData, Belt } from '../../types';
import { WT_BELTS, ITF_BELTS, KARATE_BELTS, BJJ_BELTS, JUDO_BELTS, HAPKIDO_BELTS, TANGSOODO_BELTS, AIKIDO_BELTS, KRAVMAGA_BELTS, KUNGFU_BELTS } from '../../constants';
import { useTranslation } from '../../i18n/useTranslation';

interface Step2Props {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

const PresetButton: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex-grow md:flex-grow-0 ${
      isActive
        ? 'bg-sky-500 text-white'
        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
    }`}
  >
    {label}
  </button>
);

export const Step2BeltSystem: React.FC<Step2Props> = ({ data, onUpdate }) => {
  const { t } = useTranslation(data.language);
  const [newBeltName, setNewBeltName] = useState('');
  const [newBeltColor, setNewBeltColor] = useState('#FFFFFF');
  const draggedItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleSystemChange = (system: 'wt' | 'itf' | 'karate' | 'bjj' | 'judo' | 'hapkido' | 'tangsoodo' | 'aikido' | 'kravmaga' | 'kungfu' | 'custom') => {
    let newBelts: Belt[] = [];
    switch (system) {
        case 'wt': newBelts = WT_BELTS; break;
        case 'itf': newBelts = ITF_BELTS; break;
        case 'karate': newBelts = KARATE_BELTS; break;
        case 'bjj': newBelts = BJJ_BELTS; break;
        case 'judo': newBelts = JUDO_BELTS; break;
        case 'hapkido': newBelts = HAPKIDO_BELTS; break;
        case 'tangsoodo': newBelts = TANGSOODO_BELTS; break;
        case 'aikido': newBelts = AIKIDO_BELTS; break;
        case 'kravmaga': newBelts = KRAVMAGA_BELTS; break;
        case 'kungfu': newBelts = KUNGFU_BELTS; break;
        default: newBelts = []; break;
    }
    
    if (system === 'custom') {
         onUpdate({ beltSystemType: 'custom' });
    } else {
        const customBelts = data.belts.filter(b => b.id.startsWith('custom-'));
        onUpdate({ beltSystemType: system, belts: [...newBelts, ...customBelts] });
    }
  };
  
  const handleAddBelt = () => {
    if (!newBeltName.trim()) return;
    const newBelt: Belt = {
      id: `custom-${Date.now()}`,
      name: newBeltName,
      color1: newBeltColor,
    };
    onUpdate({ belts: [...data.belts, newBelt] });
    setNewBeltName('');
    setNewBeltColor('#FFFFFF');
  };

  const handleRemoveBelt = (id: string) => {
    onUpdate({ belts: data.belts.filter(b => b.id !== id) });
  };
  
  const handleDragSort = () => {
    if (draggedItem.current === null || dragOverItem.current === null) return;
    const items = [...data.belts];
    const draggedItemContent = items.splice(draggedItem.current, 1)[0];
    items.splice(dragOverItem.current, 0, draggedItemContent);
    draggedItem.current = null;
    dragOverItem.current = null;
    onUpdate({ belts: items });
  };


  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white break-words">{t('wizard.step2.title')}</h1>
        <p className="text-gray-400 mt-2 break-words">{t('wizard.step2.subtitle')}</p>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-300">{t('wizard.step2.choosePreset')}</label>
        <div className="flex flex-wrap gap-2 justify-center">
          <PresetButton label={t('wizard.step2.presets.taekwondoWT')} isActive={data.beltSystemType === 'wt'} onClick={() => handleSystemChange('wt')} />
          <PresetButton label={t('wizard.step2.presets.taekwondoITF')} isActive={data.beltSystemType === 'itf'} onClick={() => handleSystemChange('itf')} />
          <PresetButton label={t('wizard.step2.presets.karate')} isActive={data.beltSystemType === 'karate'} onClick={() => handleSystemChange('karate')} />
          <PresetButton label={t('wizard.step2.presets.bjj')} isActive={data.beltSystemType === 'bjj'} onClick={() => handleSystemChange('bjj')} />
          <PresetButton label={t('wizard.step2.presets.judo')} isActive={data.beltSystemType === 'judo'} onClick={() => handleSystemChange('judo')} />
          <PresetButton label={t('wizard.step2.presets.hapkido')} isActive={data.beltSystemType === 'hapkido'} onClick={() => handleSystemChange('hapkido')} />
          <PresetButton label={t('wizard.step2.presets.tangSooDo')} isActive={data.beltSystemType === 'tangsoodo'} onClick={() => handleSystemChange('tangsoodo')} />
          <PresetButton label={t('wizard.step2.presets.aikido')} isActive={data.beltSystemType === 'aikido'} onClick={() => handleSystemChange('aikido')} />
          <PresetButton label={t('wizard.step2.presets.kravMaga')} isActive={data.beltSystemType === 'kravmaga'} onClick={() => handleSystemChange('kravmaga')} />
          <PresetButton label={t('wizard.step2.presets.kungFu')} isActive={data.beltSystemType === 'kungfu'} onClick={() => handleSystemChange('kungfu')} />
          <PresetButton label={t('wizard.step2.presets.custom')} isActive={data.beltSystemType === 'custom'} onClick={() => handleSystemChange('custom')} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">{t('wizard.step2.beltSequence')}</label>
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-2 max-h-72 overflow-y-auto">
          {data.belts.length === 0 && <p className="text-gray-500 text-center italic">{t('wizard.step2.noBelts')}</p>}
          {data.belts.map((belt, index) => (
            <div
              key={belt.id}
              draggable={data.beltSystemType === 'custom'}
              onDragStart={() => (draggedItem.current = index)}
              onDragEnter={() => (dragOverItem.current = index)}
              onDragEnd={handleDragSort}
              onDragOver={e => e.preventDefault()}
              className={`flex items-center p-2 rounded-md transition-shadow ${data.beltSystemType === 'custom' ? 'cursor-move bg-gray-800 hover:shadow-lg' : 'bg-gray-800'}`}
            >
              <div className="w-6 h-6 rounded-sm mr-4 flex-shrink-0" style={{ background: belt.color2 ? `linear-gradient(to right, ${belt.color1} 50%, ${belt.color2} 50%)` : belt.color1, border: belt.color1 === '#FFFFFF' ? '1px solid #4B5563' : 'none' }}></div>
              <span className="flex-grow text-white">{belt.name}</span>
              {(data.beltSystemType === 'custom' || belt.id.startsWith('custom-')) && (
                <button onClick={() => handleRemoveBelt(belt.id)} className="text-gray-500 hover:text-red-400 ml-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <p className="text-sm font-medium text-gray-300 mb-1 break-words">
              {data.beltSystemType === 'custom' ? t('wizard.step2.addBelt') : t('wizard.step2.addCustomBelt')}
          </p>
          <div className="flex items-center space-x-2">
              <input type="text" value={newBeltName} onChange={e => setNewBeltName(e.target.value)} placeholder={t('wizard.step2.beltName')} className="wizard-input flex-grow"/>
              <input type="color" value={newBeltColor} onChange={e => setNewBeltColor(e.target.value)} className="w-10 h-10 p-1 bg-gray-700 border border-gray-600 rounded-md cursor-pointer"/>
              <button onClick={handleAddBelt} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">{t('common.add')}</button>
          </div>
      </div>

       <style>{`
        .wizard-input {
            background-color: #374151; /* bg-gray-700 */
            border: 1px solid #4B5563; /* border-gray-600 */
            border-radius: 0.375rem; /* rounded-md */
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
