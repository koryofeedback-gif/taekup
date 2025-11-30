
import React, { useState, useMemo } from 'react';
import type { WizardData, Coach, Student } from '../../types';
import { sendCoachWelcomeEmail } from '../../services/geminiService';

interface Step5Props {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

const initialCoachState = { name: '', email: '', password: '', location: '', assignedClasses: [] as string[] };
const initialStudentState: Omit<Student, 'id'> = {
    name: '',
    photo: null,
    age: undefined,
    birthday: '', // Default empty
    gender: 'Male',
    beltId: '',
    stripes: 0,
    location: '',
    assignedClass: '', 
    joinDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    parentName: '',
    parentEmail: '',
    parentPhone: '',
    totalPoints: 0,
    medicalInfo: '',
    attendanceCount: 0,
    lastPromotionDate: new Date().toISOString(),
    isReadyForGrading: false,
    performanceHistory: [],
    feedbackHistory: [],
    sparringStats: { matches: 0, wins: 0, draws: 0, headKicks: 0, bodyKicks: 0, punches: 0, takedowns: 0, defense: 0 },
    badges: [],
    lifeSkillsHistory: [],
    customHabits: [
        { id: 'h1', question: 'Did they make their bed?', category: 'Chores', icon: '🛏️', isActive: true },
        { id: 'h2', question: 'Did they brush their teeth?', category: 'Health', icon: '🦷', isActive: true },
        { id: 'h3', question: 'Did they show respect to parents?', category: 'Character', icon: '🙇', isActive: true },
    ]
};


export const Step5AddPeople: React.FC<Step5Props> = ({ data, onUpdate }) => {
    const [newCoach, setNewCoach] = useState(initialCoachState);
    const [newStudent, setNewStudent] = useState(initialStudentState);
    const [studentAddMode, setStudentAddMode] = useState<'manual' | 'bulk'>('manual');
    
    // Bulk Import State
    const [parsedStudents, setParsedStudents] = useState<Student[]>([]);
    const [bulkError, setBulkError] = useState('');
    const [pasteData, setPasteData] = useState(''); // Text area state
    const [batchLocation, setBatchLocation] = useState(data.branchNames?.[0] || 'Main Location');
    const [batchClass, setBatchClass] = useState('');
    const [isValidated, setIsValidated] = useState(false); // Track validation status

    const locations = data.branchNames && data.branchNames.length > 0 ? data.branchNames : ['Main Location'];

    // Get classes specific to the currently selected student location (Manual)
    const availableClassesForStudent = newStudent.location && data.locationClasses 
        ? (data.locationClasses[newStudent.location] || []) 
        : (data.classes || []);
        
    // Get classes for Coach based on their location
    const availableClassesForCoach = newCoach.location && data.locationClasses
        ? (data.locationClasses[newCoach.location] || [])
        : [];

    const handleAddCoach = async () => {
        if (!newCoach.name || !newCoach.email) return;
        const coachToAdd: Coach = {
            id: `coach-${Date.now()}`,
            name: newCoach.name,
            email: newCoach.email,
            password: newCoach.password,
            location: newCoach.location || locations[0],
            assignedClasses: newCoach.assignedClasses
        };
        onUpdate({ coaches: [...data.coaches, coachToAdd] });
        await sendCoachWelcomeEmail(coachToAdd.name, data.clubName);
        setNewCoach(initialCoachState);
    };
    
    const handleRemoveCoach = (id: string) => {
        onUpdate({ coaches: data.coaches.filter(c => c.id !== id) });
    };
    
    const toggleCoachClass = (cls: string) => {
        const current = newCoach.assignedClasses || [];
        if (current.includes(cls)) {
            setNewCoach({ ...newCoach, assignedClasses: current.filter(c => c !== cls) });
        } else {
            setNewCoach({ ...newCoach, assignedClasses: [...current, cls] });
        }
    };

    const getPointsPerStripeForBelt = (beltId: string) => {
        if (data.useCustomPointsPerBelt && data.pointsPerBelt[beltId]) {
            return data.pointsPerBelt[beltId];
        }
        return data.pointsPerStripe;
    };

    const handleAddStudent = () => {
        if (!newStudent.name || !newStudent.beltId) return;
        
        // Calculate initial points based on stripes
        const pps = getPointsPerStripeForBelt(newStudent.beltId);
        const initialPoints = (newStudent.stripes || 0) * pps;

        // Determine class and location defaults
        const finalLocation = newStudent.location || locations[0];
        // Ensure the assigned class is actually valid for this location, otherwise pick first available or generic
        const validClasses = data.locationClasses?.[finalLocation] || data.classes || [];
        const finalClass = (newStudent.assignedClass && validClasses.includes(newStudent.assignedClass))
            ? newStudent.assignedClass 
            : (validClasses[0] || 'General Class');

        const studentToAdd: Student = {
            id: `student-${Date.now()}`,
            ...newStudent,
            totalPoints: initialPoints, // Initialize correctly based on stripes
            location: finalLocation,
            assignedClass: finalClass,
            sparringStats: { matches: 0, wins: 0, draws: 0, headKicks: 0, bodyKicks: 0, punches: 0, takedowns: 0, defense: 0 },
            badges: [],
            lifeSkillsHistory: [],
            customHabits: initialStudentState.customHabits
        };
        onUpdate({ students: [...data.students, studentToAdd] });
        setNewStudent(initialStudentState);
    };
    
    const handleRemoveStudent = (id: string) => {
        onUpdate({ students: data.students.filter(s => s.id !== id) });
    };
    
    // --- BULK PARSING LOGIC ---
    const validateBulkData = () => {
        if (!pasteData.trim()) return;
        setBulkError('');
        setParsedStudents([]);
        setIsValidated(false);

        const rows = pasteData.split(/\r?\n/).filter(r => r.trim().length > 0);
        const newStudents: Student[] = [];
        let hasError = false;

        // Try to detect if header exists. If first row has "Name" or "Belt", skip it.
        let startIndex = 0;
        if (rows[0].toLowerCase().includes('name') && rows[0].toLowerCase().includes('belt')) {
            startIndex = 1;
        }

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            // Split by Tab (Excel copy) OR Comma (CSV)
            let columns = row.split(/\t/);
            if (columns.length < 2 && row.includes(',')) {
                columns = row.split(',');
            }
            
            columns = columns.map(c => c.trim().replace(/^"|"$/g, '')); // Remove quotes

            // Mapping Logic:
            // Expecting: Name | Age | Birthday | Gender | Belt | Stripes | Parent Name | Email | Phone | [Location] | [Class]
            
            const name = columns[0];
            const ageStr = columns[1];
            const birthdayStr = columns[2]; // New Field
            const genderStr = columns[3];
            const beltName = columns[4];
            const stripesStr = columns[5];
            const parentName = columns[6];
            const parentEmail = columns[7];
            const parentPhone = columns[8];
            
            // Optional overrides from columns, otherwise use Batch Defaults
            const locFromFile = columns[9];
            const classFromFile = columns[10];

            if (!name) {
                // Skip empty lines, but if it looks like data, flag it
                if (columns.length > 2) hasError = true;
                continue;
            }

            // 1. Resolve Belt
            let belt = data.belts.find(b => b.name.toLowerCase() === beltName?.toLowerCase());
            if (!belt) {
                // Fallback: Try to match by index (e.g. if they typed '1' for White Belt)
                const beltIndex = parseInt(beltName) - 1;
                if (!isNaN(beltIndex) && data.belts[beltIndex]) {
                    belt = data.belts[beltIndex];
                } else {
                    // Critical Error: Belt not found - will be flagged in preview
                    belt = undefined; 
                }
            }

            // 2. Resolve Location & Class
            let finalLocation = batchLocation;
            if (locFromFile && data.branchNames?.includes(locFromFile)) {
                finalLocation = locFromFile;
            }

            let finalClass = batchClass || 'General Class';
            // If file specifies class, validate it
            const validClasses = data.locationClasses?.[finalLocation] || data.classes || [];
            if (classFromFile && validClasses.includes(classFromFile)) {
                finalClass = classFromFile;
            } else if (!batchClass && validClasses.length > 0) {
                // If no batch class and no file class, pick first valid
                finalClass = validClasses[0];
            }

            // 3. Calculate Points
            const stripes = parseInt(stripesStr, 10) || 0;
            // Use 64 as safe default if belt invalid, will be fixed before import
            const pps = belt ? getPointsPerStripeForBelt(belt.id) : 64; 
            const initialPoints = stripes * pps;

            const genderVal = ['Male', 'Female', 'Other'].includes(genderStr) ? genderStr as any : 'Prefer not to say';

            newStudents.push({
                id: `bulk-${Date.now()}-${i}`,
                name: name,
                photo: null,
                age: parseInt(ageStr, 10) || undefined,
                birthday: birthdayStr || '', // Store raw string, validated on input
                gender: genderVal,
                beltId: belt ? belt.id : 'INVALID_BELT', // Flag for visual error
                stripes: stripes,
                parentName: parentName,
                parentEmail: parentEmail,
                parentPhone: parentPhone,
                location: finalLocation,
                assignedClass: finalClass,
                totalPoints: initialPoints,
                joinDate: new Date().toISOString().split('T')[0],
                medicalInfo: '',
                attendanceCount: 0,
                lastPromotionDate: new Date().toISOString(),
                isReadyForGrading: false,
                performanceHistory: [],
                feedbackHistory: [],
                sparringStats: { matches: 0, wins: 0, draws: 0, headKicks: 0, bodyKicks: 0, punches: 0, takedowns: 0, defense: 0 },
                badges: [],
                lifeSkillsHistory: [],
                customHabits: initialStudentState.customHabits
            });
        }
        
        setParsedStudents(newStudents);
        
        // Check for validity
        const invalidCount = newStudents.filter(s => s.beltId === 'INVALID_BELT' || !s.name).length;
        
        if (newStudents.length === 0) {
            setBulkError("No data found. Please paste rows from Excel.");
        } else if (invalidCount > 0) {
            setBulkError(`Found ${invalidCount} rows with errors (Invalid Belt Name). Please fix and re-validate.`);
        } else {
            setIsValidated(true);
        }
    };

    const confirmBulkImport = () => {
        onUpdate({ students: [...data.students, ...parsedStudents] });
        setParsedStudents([]);
        setPasteData('');
        setIsValidated(false);
        setStudentAddMode('manual');
    };

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-2xl md:text-3xl font-bold text-white">Add Your People</h1>
                <p className="text-gray-400 mt-2">Time to fill your dojang.</p>
            </div>

            {/* --- COACH SECTION --- */}
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                    <span className="mr-2 text-xl">🥋</span> Coaches
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <input 
                        type="text" 
                        value={newCoach.name} 
                        onChange={e => setNewCoach({...newCoach, name: e.target.value})}
                        placeholder="Coach Name"
                        className="wizard-input"
                    />
                    <input 
                        type="email" 
                        value={newCoach.email} 
                        onChange={e => setNewCoach({...newCoach, email: e.target.value})}
                        placeholder="Email Address"
                        className="wizard-input"
                    />
                     <input 
                        type="password" 
                        value={newCoach.password} 
                        onChange={e => setNewCoach({...newCoach, password: e.target.value})}
                        placeholder="Temporary Password"
                        className="wizard-input"
                    />
                    <select 
                        value={newCoach.location} 
                        onChange={e => setNewCoach({...newCoach, location: e.target.value})}
                        className="wizard-input"
                    >
                        {locations.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </div>
                
                {/* Class Assignment UI for Coach */}
                {availableClassesForCoach.length > 0 && (
                     <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-400 mb-2">Assign Classes (Optional)</label>
                        <div className="flex flex-wrap gap-2">
                            {availableClassesForCoach.map(cls => (
                                <button
                                    key={cls}
                                    onClick={() => toggleCoachClass(cls)}
                                    className={`px-3 py-1 rounded text-xs font-bold border ${newCoach.assignedClasses?.includes(cls) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                                >
                                    {cls}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <button 
                    onClick={handleAddCoach}
                    disabled={!newCoach.name || !newCoach.email}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors mb-6"
                >
                    Add Coach
                </button>

                <div className="space-y-2">
                    {data.coaches.map(coach => (
                        <div key={coach.id} className="flex justify-between items-center bg-gray-900/50 p-3 rounded border border-gray-700">
                            <div>
                                <p className="font-bold text-white">{coach.name}</p>
                                <p className="text-xs text-gray-400">{coach.email}</p>
                            </div>
                            <button onClick={() => handleRemoveCoach(coach.id)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                        </div>
                    ))}
                    {data.coaches.length === 0 && <p className="text-gray-500 italic text-sm">No coaches added yet.</p>}
                </div>
            </div>

            {/* --- STUDENT SECTION --- */}
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center">
                        <span className="mr-2 text-xl">👥</span> Students
                    </h3>
                    <div className="flex bg-gray-700 rounded p-1">
                        <button 
                            onClick={() => setStudentAddMode('manual')}
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${studentAddMode === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Manual
                        </button>
                        <button 
                            onClick={() => setStudentAddMode('bulk')}
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${studentAddMode === 'bulk' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Bulk Import
                        </button>
                    </div>
                </div>

                {studentAddMode === 'manual' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <input type="text" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} placeholder="Student Name" className="wizard-input" />
                        
                        <select value={newStudent.beltId} onChange={e => setNewStudent({...newStudent, beltId: e.target.value})} className="wizard-input">
                            <option value="">Select Belt...</option>
                            {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>

                        <div className="flex items-center space-x-2">
                             <input type="number" value={newStudent.stripes || ''} onChange={e => setNewStudent({...newStudent, stripes: parseInt(e.target.value) || 0})} placeholder="Stripes" className="wizard-input" />
                             <span className="text-xs text-gray-400">stripes</span>
                        </div>

                        <select value={newStudent.location} onChange={e => setNewStudent({...newStudent, location: e.target.value, assignedClass: ''})} className="wizard-input">
                            {locations.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>

                        <select value={newStudent.assignedClass} onChange={e => setNewStudent({...newStudent, assignedClass: e.target.value})} className="wizard-input">
                            <option value="">Select Class...</option>
                            {availableClassesForStudent.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <input type="number" value={newStudent.age || ''} onChange={e => setNewStudent({...newStudent, age: parseInt(e.target.value)})} placeholder="Age" className="wizard-input" />
                            <div className="relative">
                                <input 
                                    type="date" 
                                    value={newStudent.birthday} 
                                    onChange={e => setNewStudent({...newStudent, birthday: e.target.value})} 
                                    className="wizard-input text-xs" 
                                    title="Birthday (Optional)"
                                />
                                <label className="absolute -top-3 left-1 text-[10px] bg-gray-800 px-1 text-gray-400">Birthday</label>
                            </div>
                        </div>
                        
                        <input type="text" value={newStudent.parentEmail} onChange={e => setNewStudent({...newStudent, parentEmail: e.target.value})} placeholder="Parent Email (Optional)" className="wizard-input md:col-span-2" />

                        <button 
                            onClick={handleAddStudent}
                            disabled={!newStudent.name || !newStudent.beltId}
                            className="md:col-span-2 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
                        >
                            Add Student
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 mb-4">
                        <div className="bg-gray-900/50 p-4 rounded border border-gray-600 text-sm text-gray-300">
                            <p className="font-bold mb-2">Instructions:</p>
                            <p>Copy and paste from Excel/Sheets. Required Format:</p>
                            <code className="block bg-black p-2 mt-1 rounded text-green-400 text-xs whitespace-nowrap overflow-x-auto">
                                Name | Age | Birthday | Gender | Belt | Stripes | Parent | Email | Phone | [Location] | [Class]
                            </code>
                            <p className="mt-2 text-xs text-gray-500">Note: Use Tab or Comma separator. Birthday format: YYYY-MM-DD.</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">Default Location</label>
                                <select value={batchLocation} onChange={e => setBatchLocation(e.target.value)} className="wizard-input text-sm">
                                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1">Default Class</label>
                                <select value={batchClass} onChange={e => setBatchClass(e.target.value)} className="wizard-input text-sm">
                                    <option value="">Auto-assign</option>
                                    {(data.locationClasses?.[batchLocation] || data.classes || []).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        <textarea 
                            value={pasteData}
                            onChange={e => { setPasteData(e.target.value); setIsValidated(false); }}
                            className="w-full h-32 bg-gray-900 border border-gray-600 rounded p-2 text-white text-xs font-mono"
                            placeholder={`John Doe\t8\t2016-05-15\tMale\tWhite Belt\t0\tJane Doe\tjane@ex.com\t555-0123`}
                        />
                        
                        {bulkError && <p className="text-red-400 text-sm font-bold bg-red-900/20 p-2 rounded">{bulkError}</p>}
                        
                        {parsedStudents.length > 0 && !bulkError && (
                            <div className="bg-gray-900 p-2 rounded border border-gray-700">
                                <p className="text-gray-400 text-xs font-bold mb-2 uppercase tracking-wide">Preview Data ({parsedStudents.length})</p>
                                <div className="max-h-40 overflow-y-auto">
                                    <table className="w-full text-xs text-left text-gray-300">
                                        <thead className="text-gray-500 sticky top-0 bg-gray-900">
                                            <tr>
                                                <th className="pb-1">Name</th>
                                                <th className="pb-1">Belt</th>
                                                <th className="pb-1">Birthday</th>
                                                <th className="pb-1">Location</th>
                                                <th className="pb-1">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsedStudents.map((s, i) => (
                                                <tr key={i} className="border-t border-gray-800">
                                                    <td className="py-1 font-bold">{s.name}</td>
                                                    <td className={`py-1 ${s.beltId === 'INVALID_BELT' ? 'text-red-500 font-bold' : ''}`}>
                                                        {s.beltId === 'INVALID_BELT' ? 'Unknown Belt' : data.belts.find(b => b.id === s.beltId)?.name}
                                                    </td>
                                                    <td className="py-1">{s.birthday || '-'}</td>
                                                    <td className="py-1">{s.location}</td>
                                                    <td className="py-1">
                                                        {s.beltId === 'INVALID_BELT' ? '❌' : '✅'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="flex space-x-3">
                            <button 
                                onClick={validateBulkData}
                                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded transition-colors"
                            >
                                Validate Data
                            </button>
                            <button 
                                onClick={confirmBulkImport}
                                disabled={!isValidated || parsedStudents.length === 0}
                                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-2 px-4 rounded transition-colors"
                            >
                                Import {parsedStudents.length} Students
                            </button>
                        </div>
                    </div>
                )}

                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {data.students.slice().reverse().map(student => (
                        <div key={student.id} className="flex justify-between items-center bg-gray-900/50 p-3 rounded border border-gray-700">
                            <div>
                                <p className="font-bold text-white">{student.name} <span className="text-xs font-normal text-gray-400">({student.age ? `${student.age}y` : ''})</span></p>
                                <p className="text-xs text-gray-400">
                                    {data.belts.find(b => b.id === student.beltId)?.name} 
                                    {student.stripes > 0 && ` • ${student.stripes} stripes`}
                                    {student.location && ` • ${student.location}`}
                                </p>
                            </div>
                            <button onClick={() => handleRemoveStudent(student.id)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                        </div>
                    ))}
                    {data.students.length === 0 && <p className="text-gray-500 italic text-sm">No students added yet.</p>}
                </div>
            </div>

            <style>{`
                .wizard-input {
                    background-color: #374151;
                    border: 1px solid #4B5563;
                    border-radius: 0.375rem;
                    padding: 0.5rem 0.75rem;
                    color: white;
                    width: 100%;
                }
                .wizard-input:focus {
                    outline: none;
                    border-color: #3B82F6;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
                }
            `}</style>
        </div>
    );
};
