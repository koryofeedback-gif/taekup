
import React, { useState } from 'react';
import type { WizardData, Skill } from '../../types';

interface Step3Props {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

export const Step3Skills: React.FC<Step3Props> = ({ data, onUpdate }) => {
    const [newSkillName, setNewSkillName] = useState('');
    const activeSkillsCount = data.skills.filter(s => s.isActive).length;

    const handleSkillToggle = (id: string) => {
        const updatedSkills = data.skills.map(skill =>
            skill.id === id ? { ...skill, isActive: !skill.isActive } : skill
        );
        onUpdate({ skills: updatedSkills });
    };

    const handleSkillRename = (id: string, newName: string) => {
        const updatedSkills = data.skills.map(skill =>
            skill.id === id ? { ...skill, name: newName } : skill
        );
        onUpdate({ skills: updatedSkills });
    };

    const handleAddSkill = () => {
        if (!newSkillName.trim()) return;
        const newSkill: Skill = {
            id: `skill-${Date.now()}`,
            name: newSkillName.trim(),
            isActive: true,
            isCustom: true,
        };
        onUpdate({ skills: [...data.skills, newSkill] });
        setNewSkillName('');
    };
    
    const handleRemoveSkill = (id: string) => {
        onUpdate({ skills: data.skills.filter(s => s.id !== id) });
    };

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-2xl md:text-3xl font-bold text-white">Skills & Performance Metrics</h1>
                <p className="text-gray-400 mt-2">Define the core competencies you'll evaluate during each class</p>
            </div>

            {/* Research Note */}
            <div className="bg-cyan-900/30 border border-cyan-700/50 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                    <span className="text-cyan-400 text-xl">💡</span>
                    <div>
                        <p className="text-cyan-300 font-medium text-sm">Research-Backed Defaults</p>
                        <p className="text-cyan-400/80 text-xs mt-1">These four skills are derived from sports psychology research on martial arts development. They represent the key pillars of student growth: physical execution, mental commitment, attentional control, and behavioral consistency. Customize as needed for your teaching philosophy.</p>
                    </div>
                </div>
            </div>

            {/* Skills List */}
            <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-300">Performance Categories</label>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-3">
                    {data.skills.map(skill => (
                        <div key={skill.id} className="flex items-center space-x-3">
                            <ToggleSwitch checked={skill.isActive} onChange={() => handleSkillToggle(skill.id)} />
                            <input
                                type="text"
                                value={skill.name}
                                onChange={(e) => handleSkillRename(skill.id, e.target.value)}
                                className="wizard-input flex-1"
                                disabled={!skill.isActive}
                            />
                            {skill.isCustom && (
                                <button onClick={() => handleRemoveSkill(skill.id)} className="text-gray-500 hover:text-red-400">
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                 <div className="flex items-center space-x-2 pt-2">
                    <input
                        type="text"
                        value={newSkillName}
                        onChange={e => setNewSkillName(e.target.value)}
                        placeholder="Add Custom Skill..."
                        className="wizard-input flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSkill()}
                    />
                    <button onClick={handleAddSkill} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Add</button>
                </div>
            </div>

            {/* Scoring System */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-3">How you'll score each skill</h3>
                <div className="flex justify-around items-center text-center py-2">
                    <div>
                        <span className="text-3xl">💚</span>
                        <p className="text-sm text-gray-300 mt-1">2 Points</p>
                    </div>
                    <div>
                        <span className="text-3xl">💛</span>
                        <p className="text-sm text-gray-300 mt-1">1 Point</p>
                    </div>
                    <div>
                        <span className="text-3xl">❤️</span>
                        <p className="text-sm text-gray-300 mt-1">0 Points</p>
                    </div>
                </div>
                <div className="mt-4 text-center bg-gray-900/50 p-3 rounded-lg">
                     <p className="text-gray-300">Each class gives up to <strong className="text-white">{activeSkillsCount * 2}</strong> points ({activeSkillsCount} skills × 2 max).</p>
                </div>
            </div>

            {/* Bonus Section */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-3">Bonus System (Optional)</h3>
                <div className="space-y-3">
                    <BonusToggle label="Homework Bonus" description="Manually add variable points for completed homework." enabled={data.homeworkBonus} onToggle={() => onUpdate({ homeworkBonus: !data.homeworkBonus })} />
                    <BonusToggle label="Coach Bonus" description="Manually add +1 to ∞ bonus points during class." enabled={data.coachBonus} onToggle={() => onUpdate({ coachBonus: !data.coachBonus })} />
                </div>
            </div>

            <style>{`
            .wizard-input {
                background-color: #374151; /* bg-gray-700 */
                border: 1px solid #4B5563; /* border-gray-600 */
                border-radius: 0.375rem; /* rounded-md */
                padding: 0.5rem 0.75rem;
                color: white;
            }
            .wizard-input:focus {
                outline: none;
                border-color: #3B82F6; /* focus:border-sky-500 */
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5); /* focus:ring-sky-500 */
            }
             .wizard-input:disabled {
                background-color: #4B5563; /* bg-gray-600 */
                color: #9CA3AF; /* text-gray-400 */
                cursor: not-allowed;
            }
            `}</style>
        </div>
    );
};

// Helper components local to this file
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

const BonusToggle: React.FC<{ label: string; description: string; enabled: boolean; onToggle: () => void; }> = ({ label, description, enabled, onToggle }) => (
    <div className="flex items-center justify-between">
        <div>
            <p className="font-medium text-white">{label}</p>
            <p className="text-sm text-gray-400">{description}</p>
        </div>
        <ToggleSwitch checked={enabled} onChange={onToggle} />
    </div>
);
