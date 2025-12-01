import React, { useState } from 'react';
import type { CustomChallenge, ChallengeCategory } from '../types';

interface ChallengeBuilderProps {
    coachId: string;
    coachName: string;
    existingChallenges: CustomChallenge[];
    onSaveChallenge: (challenge: CustomChallenge) => void;
    onDeleteChallenge: (challengeId: string) => void;
    onToggleChallenge: (challengeId: string, isActive: boolean) => void;
    onClose: () => void;
}

const CATEGORY_OPTIONS: { value: ChallengeCategory; label: string; icon: string; color: string }[] = [
    { value: 'Strength', label: 'Strength', icon: '💪', color: 'red' },
    { value: 'Flexibility', label: 'Flexibility', icon: '🧘', color: 'purple' },
    { value: 'Speed', label: 'Speed', icon: '⚡', color: 'yellow' },
    { value: 'Skill', label: 'Skill', icon: '🎯', color: 'blue' },
    { value: 'Endurance', label: 'Endurance', icon: '🏃', color: 'green' },
    { value: 'Custom', label: 'Custom', icon: '⭐', color: 'cyan' },
];

const ICON_OPTIONS = [
    '💪', '🦵', '👊', '🥋', '🎯', '⚡', '🔥', '🏃', '🧘', '🤸',
    '🦶', '🥊', '🏋️', '⏱️', '🌟', '💫', '🎖️', '🏆', '🥇', '🪢',
    '🧱', '🌉', '🦅', '🐯', '🐉', '🦁', '🐺', '🦊'
];

const DIFFICULTY_OPTIONS: { value: CustomChallenge['difficulty']; label: string; xpMultiplier: number }[] = [
    { value: 'Easy', label: 'Easy', xpMultiplier: 1 },
    { value: 'Medium', label: 'Medium', xpMultiplier: 1.5 },
    { value: 'Hard', label: 'Hard', xpMultiplier: 2 },
    { value: 'Expert', label: 'Expert', xpMultiplier: 3 },
];

const MEASUREMENT_TYPES: { value: CustomChallenge['measurementType']; label: string; units: string[] }[] = [
    { value: 'count', label: 'Count (Reps)', units: ['reps', 'kicks', 'punches', 'jumps'] },
    { value: 'time', label: 'Time (Duration)', units: ['seconds', 'minutes'] },
    { value: 'distance', label: 'Distance', units: ['meters', 'feet', 'inches', 'cm'] },
    { value: 'score', label: 'Score (Points)', units: ['points', 'accuracy %'] },
];

export const ChallengeBuilder: React.FC<ChallengeBuilderProps> = ({
    coachId,
    coachName,
    existingChallenges,
    onSaveChallenge,
    onDeleteChallenge,
    onToggleChallenge,
    onClose,
}) => {
    const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');
    const [editingChallenge, setEditingChallenge] = useState<CustomChallenge | null>(null);
    
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<ChallengeCategory>('Strength');
    const [icon, setIcon] = useState('💪');
    const [baseXp, setBaseXp] = useState(50);
    const [videoUrl, setVideoUrl] = useState('');
    const [difficulty, setDifficulty] = useState<CustomChallenge['difficulty']>('Medium');
    const [measurementType, setMeasurementType] = useState<CustomChallenge['measurementType']>('count');
    const [measurementUnit, setMeasurementUnit] = useState('reps');
    const [targetAudience, setTargetAudience] = useState<CustomChallenge['targetAudience']>('all');
    const [isWeeklyChallenge, setIsWeeklyChallenge] = useState(false);
    const [showIconPicker, setShowIconPicker] = useState(false);

    const resetForm = () => {
        setName('');
        setDescription('');
        setCategory('Strength');
        setIcon('💪');
        setBaseXp(50);
        setVideoUrl('');
        setDifficulty('Medium');
        setMeasurementType('count');
        setMeasurementUnit('reps');
        setTargetAudience('all');
        setIsWeeklyChallenge(false);
        setEditingChallenge(null);
    };

    const loadChallengeForEdit = (challenge: CustomChallenge) => {
        setEditingChallenge(challenge);
        setName(challenge.name);
        setDescription(challenge.description);
        setCategory(challenge.category);
        setIcon(challenge.icon);
        setBaseXp(challenge.xp);
        setVideoUrl(challenge.videoUrl || '');
        setDifficulty(challenge.difficulty);
        setMeasurementType(challenge.measurementType);
        setMeasurementUnit(challenge.measurementUnit);
        setTargetAudience(challenge.targetAudience);
        setIsWeeklyChallenge(challenge.weeklyChallenge || false);
        setActiveTab('create');
    };

    const handleSave = () => {
        if (!name.trim()) return;

        const difficultyMultiplier = DIFFICULTY_OPTIONS.find(d => d.value === difficulty)?.xpMultiplier || 1;
        const finalXp = Math.round(baseXp * difficultyMultiplier);

        const challenge: CustomChallenge = {
            id: editingChallenge?.id || `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name.trim(),
            description: description.trim(),
            category,
            icon,
            xp: finalXp,
            videoUrl: videoUrl.trim() || undefined,
            difficulty,
            measurementType,
            measurementUnit,
            createdBy: coachId,
            createdByName: coachName,
            createdAt: editingChallenge?.createdAt || new Date().toISOString(),
            isActive: editingChallenge?.isActive ?? true,
            targetAudience,
            weeklyChallenge: isWeeklyChallenge,
            expiresAt: isWeeklyChallenge ? getNextSunday() : undefined,
        };

        onSaveChallenge(challenge);
        resetForm();
        setActiveTab('manage');
    };

    const getNextSunday = () => {
        const today = new Date();
        const daysUntilSunday = 7 - today.getDay();
        const nextSunday = new Date(today);
        nextSunday.setDate(today.getDate() + daysUntilSunday);
        nextSunday.setHours(23, 59, 59, 999);
        return nextSunday.toISOString();
    };

    const getCategoryColor = (cat: ChallengeCategory) => {
        return CATEGORY_OPTIONS.find(c => c.value === cat)?.color || 'gray';
    };

    const activeChallenges = existingChallenges.filter(c => c.isActive);
    const inactiveChallenges = existingChallenges.filter(c => !c.isActive);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-cyan-500/30 shadow-2xl">
                <div className="bg-gradient-to-r from-cyan-900/50 to-blue-900/50 p-6 border-b border-cyan-500/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <span className="text-3xl mr-3">🏆</span>
                            <div>
                                <h2 className="text-2xl font-black text-white">Challenge Builder</h2>
                                <p className="text-cyan-300 text-sm">Create custom challenges for your students</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white text-2xl transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                    
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => setActiveTab('create')}
                            className={`px-4 py-2 rounded-lg font-bold transition-all ${
                                activeTab === 'create'
                                    ? 'bg-cyan-500 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                        >
                            {editingChallenge ? '✏️ Edit Challenge' : '➕ Create New'}
                        </button>
                        <button
                            onClick={() => { setActiveTab('manage'); resetForm(); }}
                            className={`px-4 py-2 rounded-lg font-bold transition-all ${
                                activeTab === 'manage'
                                    ? 'bg-cyan-500 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                        >
                            📋 Manage ({existingChallenges.length})
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                    {activeTab === 'create' ? (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-400 mb-2">
                                        Challenge Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g., 100 Kicks Challenge"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-400 mb-2">
                                        Category
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {CATEGORY_OPTIONS.map(cat => (
                                            <button
                                                key={cat.value}
                                                onClick={() => setCategory(cat.value)}
                                                className={`p-2 rounded-lg border-2 transition-all text-center ${
                                                    category === cat.value
                                                        ? `border-${cat.color}-500 bg-${cat.color}-900/30`
                                                        : 'border-gray-700 hover:border-gray-500'
                                                }`}
                                            >
                                                <span className="text-xl">{cat.icon}</span>
                                                <div className="text-xs text-gray-400 mt-1">{cat.label}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-400 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Describe what students need to do for this challenge..."
                                    rows={3}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-400 mb-2">
                                        Icon
                                    </label>
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowIconPicker(!showIconPicker)}
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-3xl text-center hover:border-cyan-500 transition-colors"
                                        >
                                            {icon}
                                        </button>
                                        {showIconPicker && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg p-3 grid grid-cols-7 gap-2 z-10 shadow-xl">
                                                {ICON_OPTIONS.map(ico => (
                                                    <button
                                                        key={ico}
                                                        onClick={() => { setIcon(ico); setShowIconPicker(false); }}
                                                        className={`text-2xl p-2 rounded-lg transition-all ${
                                                            icon === ico
                                                                ? 'bg-cyan-500/30 ring-2 ring-cyan-500'
                                                                : 'hover:bg-gray-700'
                                                        }`}
                                                    >
                                                        {ico}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-400 mb-2">
                                        Base XP Reward
                                    </label>
                                    <input
                                        type="number"
                                        value={baseXp}
                                        onChange={(e) => setBaseXp(Math.max(10, parseInt(e.target.value) || 10))}
                                        min={10}
                                        max={500}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Final XP: {Math.round(baseXp * (DIFFICULTY_OPTIONS.find(d => d.value === difficulty)?.xpMultiplier || 1))}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-400 mb-2">
                                        Difficulty
                                    </label>
                                    <select
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value as CustomChallenge['difficulty'])}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                                    >
                                        {DIFFICULTY_OPTIONS.map(diff => (
                                            <option key={diff.value} value={diff.value}>
                                                {diff.label} ({diff.xpMultiplier}x XP)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-400 mb-2">
                                        Measurement Type
                                    </label>
                                    <select
                                        value={measurementType}
                                        onChange={(e) => {
                                            const newType = e.target.value as CustomChallenge['measurementType'];
                                            setMeasurementType(newType);
                                            const typeOption = MEASUREMENT_TYPES.find(t => t.value === newType);
                                            if (typeOption && typeOption.units.length > 0) {
                                                setMeasurementUnit(typeOption.units[0]);
                                            }
                                        }}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                                    >
                                        {MEASUREMENT_TYPES.map(type => (
                                            <option key={type.value} value={type.value}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-400 mb-2">
                                        Unit
                                    </label>
                                    <select
                                        value={measurementUnit}
                                        onChange={(e) => setMeasurementUnit(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                                    >
                                        {MEASUREMENT_TYPES.find(t => t.value === measurementType)?.units.map(unit => (
                                            <option key={unit} value={unit}>
                                                {unit}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-400 mb-2">
                                    Demo Video URL (Optional)
                                </label>
                                <input
                                    type="url"
                                    value={videoUrl}
                                    onChange={(e) => setVideoUrl(e.target.value)}
                                    placeholder="https://youtube.com/watch?v=..."
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Add a YouTube link to show students how to perform this challenge
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-400 mb-2">
                                        Target Audience
                                    </label>
                                    <select
                                        value={targetAudience}
                                        onChange={(e) => setTargetAudience(e.target.value as CustomChallenge['targetAudience'])}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
                                    >
                                        <option value="all">All Students</option>
                                        <option value="beginners">Beginners (White-Yellow)</option>
                                        <option value="intermediate">Intermediate (Green-Blue)</option>
                                        <option value="advanced">Advanced (Red-Black)</option>
                                    </select>
                                </div>

                                <div className="flex items-center">
                                    <label className="flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={isWeeklyChallenge}
                                            onChange={(e) => setIsWeeklyChallenge(e.target.checked)}
                                            className="w-5 h-5 rounded border-gray-700 bg-gray-800 text-cyan-500 focus:ring-cyan-500"
                                        />
                                        <span className="ml-3 text-white font-medium">
                                            🏆 Weekly Challenge
                                        </span>
                                    </label>
                                    {isWeeklyChallenge && (
                                        <span className="ml-3 text-xs text-yellow-400">
                                            Expires Sunday midnight
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                                <h4 className="font-bold text-white mb-3">Preview</h4>
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center text-3xl">
                                        {icon}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-white">{name || 'Challenge Name'}</span>
                                            {isWeeklyChallenge && (
                                                <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full">
                                                    Weekly
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-gray-400 text-sm">{description || 'Challenge description...'}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className={`text-xs px-2 py-0.5 rounded-full bg-${getCategoryColor(category)}-500/20 text-${getCategoryColor(category)}-400`}>
                                                {category}
                                            </span>
                                            <span className="text-xs text-gray-500">{difficulty}</span>
                                            <span className="text-green-400 text-sm font-bold">
                                                +{Math.round(baseXp * (DIFFICULTY_OPTIONS.find(d => d.value === difficulty)?.xpMultiplier || 1))} XP
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleSave}
                                    disabled={!name.trim()}
                                    className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 rounded-xl transition-all disabled:cursor-not-allowed"
                                >
                                    {editingChallenge ? '💾 Update Challenge' : '🚀 Create Challenge'}
                                </button>
                                {editingChallenge && (
                                    <button
                                        onClick={resetForm}
                                        className="px-6 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-all"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {existingChallenges.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-6xl mb-4">🏆</div>
                                    <h3 className="text-xl font-bold text-white mb-2">No Custom Challenges Yet</h3>
                                    <p className="text-gray-400 mb-6">Create your first challenge for your students!</p>
                                    <button
                                        onClick={() => setActiveTab('create')}
                                        className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-6 py-3 rounded-xl transition-all"
                                    >
                                        ➕ Create Challenge
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {activeChallenges.length > 0 && (
                                        <div>
                                            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                                                <span className="text-green-400">●</span> Active Challenges ({activeChallenges.length})
                                            </h3>
                                            <div className="space-y-3">
                                                {activeChallenges.map(challenge => (
                                                    <ChallengeCard
                                                        key={challenge.id}
                                                        challenge={challenge}
                                                        onEdit={() => loadChallengeForEdit(challenge)}
                                                        onDelete={() => onDeleteChallenge(challenge.id)}
                                                        onToggle={() => onToggleChallenge(challenge.id, false)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {inactiveChallenges.length > 0 && (
                                        <div>
                                            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                                                <span className="text-gray-500">●</span> Inactive Challenges ({inactiveChallenges.length})
                                            </h3>
                                            <div className="space-y-3 opacity-60">
                                                {inactiveChallenges.map(challenge => (
                                                    <ChallengeCard
                                                        key={challenge.id}
                                                        challenge={challenge}
                                                        onEdit={() => loadChallengeForEdit(challenge)}
                                                        onDelete={() => onDeleteChallenge(challenge.id)}
                                                        onToggle={() => onToggleChallenge(challenge.id, true)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ChallengeCard: React.FC<{
    challenge: CustomChallenge;
    onEdit: () => void;
    onDelete: () => void;
    onToggle: () => void;
}> = ({ challenge, onEdit, onDelete, onToggle }) => {
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);

    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-cyan-500/50 transition-all">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gray-700 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                    {challenge.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white truncate">{challenge.name}</span>
                        {challenge.weeklyChallenge && (
                            <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
                                Weekly
                            </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                            challenge.difficulty === 'Easy' ? 'bg-green-500/20 text-green-400' :
                            challenge.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            challenge.difficulty === 'Hard' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-red-500/20 text-red-400'
                        }`}>
                            {challenge.difficulty}
                        </span>
                    </div>
                    <p className="text-gray-400 text-sm truncate">{challenge.description || 'No description'}</p>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500">{challenge.category}</span>
                        <span className="text-green-400 text-sm font-bold">+{challenge.xp} XP</span>
                        <span className="text-xs text-gray-500">by {challenge.createdByName}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={onToggle}
                        className={`p-2 rounded-lg transition-all ${
                            challenge.isActive
                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                        title={challenge.isActive ? 'Deactivate' : 'Activate'}
                    >
                        {challenge.isActive ? '✓' : '○'}
                    </button>
                    <button
                        onClick={onEdit}
                        className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all"
                        title="Edit"
                    >
                        ✏️
                    </button>
                    {showConfirmDelete ? (
                        <div className="flex gap-1">
                            <button
                                onClick={() => { onDelete(); setShowConfirmDelete(false); }}
                                className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-400 transition-all text-xs font-bold"
                            >
                                Yes
                            </button>
                            <button
                                onClick={() => setShowConfirmDelete(false)}
                                className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-all text-xs"
                            >
                                No
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowConfirmDelete(true)}
                            className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all"
                            title="Delete"
                        >
                            🗑️
                        </button>
                    )}
                </div>
            </div>
            {challenge.videoUrl && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                    <a
                        href={challenge.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 text-sm hover:underline flex items-center gap-1"
                    >
                        ▶️ Watch Demo Video
                    </a>
                </div>
            )}
        </div>
    );
};

export default ChallengeBuilder;
