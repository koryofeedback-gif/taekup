
import React, { useEffect } from 'react';
import type { WizardData } from '../../types';
import { useTranslation } from '../../i18n/useTranslation';

const ToggleSwitch: React.FC<{ checked: boolean; onChange: () => void; }> = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={onChange}
        className={`${checked ? 'bg-sky-500' : 'bg-gray-600'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-gray-800`}
        role="switch"
        aria-checked={checked}
    >
        <span className={`${checked ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}/>
    </button>
);

interface Step4Props {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

export const Step4Rules: React.FC<Step4Props> = ({ data, onUpdate }) => {
  const { t } = useTranslation(data.language);

  useEffect(() => {
      if (data.useCustomPointsPerBelt && Object.keys(data.pointsPerBelt).length === 0) {
          const initialMap: Record<string, number> = {};
          let currentPoints = data.pointsPerStripe || 64;
          data.belts.forEach((belt) => {
              initialMap[belt.id] = currentPoints;
              currentPoints += 16;
          });
          onUpdate({ pointsPerBelt: initialMap });
      }
  }, [data.useCustomPointsPerBelt, data.belts]);

  const handlePointsPerBeltChange = (beltId: string, val: number) => {
      const newMap = { ...data.pointsPerBelt, [beltId]: val };
      onUpdate({ pointsPerBelt: newMap });
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white break-words">{t('wizard.step4.title')}</h1>
        <p className="text-gray-400 mt-2 break-words">{t('wizard.step4.promotionPace')}</p>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
        <h3 className="text-lg font-semibold text-white break-words">{t('wizard.step4.promotionPace')}</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="stripesPerBelt" className="block text-sm font-medium text-gray-300 break-words">{t('wizard.step4.stripesPerBelt')}</label>
            <input 
              id="stripesPerBelt" 
              type="number" 
              min="1" 
              value={data.stripesPerBelt} 
              onChange={e => onUpdate({ stripesPerBelt: parseInt(e.target.value, 10) || 1 })} 
              className="mt-1 wizard-input" 
            />
          </div>
           <div className="md:col-span-2 bg-gray-700/30 p-4 rounded-md border border-gray-700">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
                    <label className="block text-sm font-medium text-gray-300 break-words">{t('wizard.step4.stripeRule')}</label>
                    <div className="flex space-x-4 text-sm mt-2 sm:mt-0">
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="radio" 
                                name="pointsRule" 
                                checked={!data.useCustomPointsPerBelt} 
                                onChange={() => onUpdate({ useCustomPointsPerBelt: false })}
                                className="form-radio text-sky-500 h-4 w-4"
                            />
                            <span className="ml-2 text-white">{t('wizard.step4.simple')}</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="radio" 
                                name="pointsRule" 
                                checked={data.useCustomPointsPerBelt} 
                                onChange={() => onUpdate({ useCustomPointsPerBelt: true })}
                                className="form-radio text-sky-500 h-4 w-4"
                            />
                            <span className="ml-2 text-white">{t('wizard.step4.advanced')}</span>
                        </label>
                    </div>
                </div>

                {!data.useCustomPointsPerBelt ? (
                    <div>
                        <label htmlFor="pointsPerStripe" className="block text-sm font-medium text-gray-300 break-words">{t('wizard.step4.pointsPerStripe')}</label>
                        <input 
                          id="pointsPerStripe" 
                          type="number" 
                          min="1" 
                          value={data.pointsPerStripe} 
                          onChange={e => onUpdate({ pointsPerStripe: parseInt(e.target.value, 10) || 1 })} 
                          className="mt-1 wizard-input" 
                        />
                        <p className="text-xs text-gray-400 mt-2 break-words">{t('wizard.step4.simpleDesc')}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                                <tr>
                                    <th className="px-4 py-2">{t('wizard.step5.belt')}</th>
                                    <th className="px-4 py-2">{t('wizard.step4.pointsPerStripe')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.belts.map(belt => (
                                    <tr key={belt.id} className="border-b border-gray-700 bg-gray-800">
                                        <td className="px-4 py-2 flex items-center">
                                             <div className="w-4 h-4 rounded-sm mr-2" style={{ background: belt.color2 ? `linear-gradient(to right, ${belt.color1} 50%, ${belt.color2} 50%)` : belt.color1, border: belt.color1 === '#FFFFFF' ? '1px solid #666' : 'none' }}></div>
                                            {belt.name}
                                        </td>
                                        <td className="px-4 py-2">
                                            <input 
                                                type="number"
                                                value={data.pointsPerBelt[belt.id] || data.pointsPerStripe}
                                                onChange={e => handlePointsPerBeltChange(belt.id, parseInt(e.target.value) || 0)}
                                                className="w-24 bg-gray-900 border border-gray-600 rounded p-1 text-center text-white focus:ring-sky-500"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                         <p className="text-xs text-gray-400 mt-2 break-words">{t('wizard.step4.advancedDesc')}</p>
                    </div>
                )}
           </div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-3 break-words">{t('wizard.step4.visualMotivation')}</h3>
        <div className="flex items-center justify-between">
            <div>
                <p className="font-medium text-white break-words">{t('wizard.step4.colorStripes')}</p>
            </div>
            <ToggleSwitch checked={data.useColorCodedStripes} onChange={() => onUpdate({ useColorCodedStripes: !data.useColorCodedStripes })} />
        </div>
        {data.useColorCodedStripes && (
            <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">{t('wizard.step4.stripesPerBelt')} ({data.stripesPerBelt})</label>
                <div className="flex flex-wrap gap-3">
                    {Array.from({ length: data.stripesPerBelt }).map((_, index) => {
                         const currentColor = data.stripeColors?.[index] || '#FFFFFF'; 
                         return (
                            <div key={index} className="flex flex-col items-center space-y-1">
                                <input
                                    type="color"
                                    value={currentColor}
                                    onChange={(e) => {
                                        const newColors = [...(data.stripeColors || [])];
                                        for(let i=0; i<=index; i++) {
                                            if(!newColors[i]) newColors[i] = '#FFFFFF';
                                        }
                                        newColors[index] = e.target.value;
                                        onUpdate({ stripeColors: newColors });
                                    }}
                                    className="w-10 h-10 p-1 bg-gray-700 border border-gray-600 rounded-md cursor-pointer"
                                />
                                <span className="text-xs text-gray-500">#{index + 1}</span>
                            </div>
                         );
                    })}
                </div>
            </div>
        )}
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3 break-words">{t('wizard.step4.bonusPoints')}</h3>
          <div className="space-y-4">
              <div className="flex items-center justify-between">
                  <div>
                      <p className="font-medium text-white break-words">{t('wizard.step4.coachBonus')}</p>
                  </div>
                  <ToggleSwitch checked={data.coachBonus} onChange={() => onUpdate({ coachBonus: !data.coachBonus })} />
              </div>
              <div className="flex items-center justify-between">
                  <div>
                      <p className="font-medium text-white break-words">{t('wizard.step4.homework')}</p>
                  </div>
                  <ToggleSwitch checked={data.homeworkBonus} onChange={() => onUpdate({ homeworkBonus: !data.homeworkBonus })} />
              </div>
          </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3 break-words">{t('wizard.step4.gradingRequirement')}</h3>
          <div className="space-y-4">
              <div className="flex items-center justify-between">
                  <div>
                      <p className="font-medium text-white break-words">{t('wizard.step4.requireSkill')}</p>
                  </div>
                  <ToggleSwitch checked={data.gradingRequirementEnabled} onChange={() => onUpdate({ gradingRequirementEnabled: !data.gradingRequirementEnabled })} />
              </div>
              
              {data.gradingRequirementEnabled && (
                  <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1 break-words">{t('wizard.step4.requirementName')}</label>
                      <input 
                          type="text" 
                          value={data.gradingRequirementName} 
                          onChange={e => onUpdate({ gradingRequirementName: e.target.value })}
                          placeholder={t('wizard.step4.requirementPlaceholder')}
                          className="wizard-input"
                      />
                  </div>
              )}
          </div>
      </div>
      
      <div className="text-center bg-gray-900/50 p-4 rounded-lg border border-gray-700">
        <p className="text-lg text-gray-300 break-words">
          {data.stripesPerBelt} {t('wizard.step4.stripesPerBelt')} {data.gradingRequirementEnabled ? `+ ${data.gradingRequirementName || t('wizard.step4.requirementName')} ` : ''}= New Belt
        </p>
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
