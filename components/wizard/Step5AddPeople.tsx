
import React, { useState, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { WizardData, Coach, Student } from '../../types';

interface Step5Props {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

const getInitialCoachState = (locations: string[]) => ({ 
    name: '', 
    email: '', 
    password: '', 
    location: locations[0] || '', 
    assignedClasses: [] as string[] 
});
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
    parentPassword: '',
    totalPoints: 0,
    totalXP: 0,
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
    const locations = data.branchNames && data.branchNames.length > 0 ? data.branchNames : ['Main Location'];
    
    const [newCoach, setNewCoach] = useState(() => getInitialCoachState(locations));
    const [newStudent, setNewStudent] = useState(initialStudentState);
    const [studentAddMode, setStudentAddMode] = useState<'manual' | 'bulk'>('manual');
    const [studentImportMethod, setStudentImportMethod] = useState<'bulk' | 'excel'>('bulk');
    
    const [parsedStudents, setParsedStudents] = useState<Student[]>([]);
    const [bulkError, setBulkError] = useState('');
    const [bulkStudentData, setBulkStudentData] = useState('');
    const [batchLocation, setBatchLocation] = useState(data.branchNames?.[0] || 'Main Location');
    const [batchClass, setBatchClass] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [uploadedFileName, setUploadedFileName] = useState('');
    const excelFileInputRef = useRef<HTMLInputElement>(null);

    // Get classes specific to the currently selected student location (Manual)
    const availableClassesForStudent = newStudent.location && data.locationClasses 
        ? (data.locationClasses[newStudent.location] || []) 
        : (data.classes || []);
        
    // Get classes for Coach based on their location
    const availableClassesForCoach = newCoach.location && data.locationClasses
        ? (data.locationClasses[newCoach.location] || [])
        : [];

    const handleAddCoach = () => {
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
        setNewCoach(getInitialCoachState(locations));
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
        
        const pps = getPointsPerStripeForBelt(newStudent.beltId);
        const stripeBasedPoints = (newStudent.stripes || 0) * pps;
        const finalPoints = newStudent.totalPoints || stripeBasedPoints;

        const finalLocation = newStudent.location || locations[0];
        const validClasses = data.locationClasses?.[finalLocation] || data.classes || [];
        const finalClass = (newStudent.assignedClass && validClasses.includes(newStudent.assignedClass))
            ? newStudent.assignedClass 
            : (validClasses[0] || 'General Class');

        const studentToAdd: Student = {
            id: `student-${Date.now()}`,
            ...newStudent,
            totalPoints: finalPoints,
            totalXP: newStudent.totalXP || 0,
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
    
    const parseBulkStudents = (csv: string) => {
        const lines = csv.split('\n').filter(l => l.trim());
        const newStudents: Student[] = [];

        const startLine = lines[0]?.toLowerCase().includes('name') && lines[0]?.toLowerCase().includes('belt') ? 1 : 0;

        lines.forEach((line, i) => {
            if (i < startLine) return;
            const cols = line.split(/[,\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
            const name = cols[0];
            const beltName = cols[4];
            
            if (!name) return;

            let belt = data.belts.find(b => b.name.toLowerCase() === beltName?.toLowerCase());
            if (!belt) {
                const beltIdx = parseInt(beltName) - 1;
                if (!isNaN(beltIdx) && data.belts[beltIdx]) belt = data.belts[beltIdx];
            }

            newStudents.push({
                id: `student-${Date.now()}-${i}`,
                name: cols[0],
                age: parseInt(cols[1]) || undefined,
                birthday: cols[2] || '',
                gender: (['Male', 'Female', 'Other', 'Prefer not to say'].includes(cols[3]) ? cols[3] : 'Male') as 'Male' | 'Female' | 'Other' | 'Prefer not to say',
                beltId: belt?.id || 'INVALID_BELT',
                stripes: parseInt(cols[5]) || 0,
                parentName: cols[8] || '',
                parentEmail: cols[9] || '',
                parentPhone: cols[10] || '',
                location: batchLocation,
                assignedClass: batchClass || 'General Class',
                joinDate: new Date().toISOString().split('T')[0],
                totalPoints: parseInt(cols[6]) || 0,
                totalXP: parseInt(cols[7]) || 0,
                attendanceCount: 0,
                lastPromotionDate: new Date().toISOString(),
                isReadyForGrading: false,
                performanceHistory: [],
                feedbackHistory: [],
                photo: null,
                medicalInfo: '',
                badges: [],
                sparringStats: { matches: 0, wins: 0, draws: 0, headKicks: 0, bodyKicks: 0, punches: 0, takedowns: 0, defense: 0 },
                lifeSkillsHistory: [],
                customHabits: [
                    { id: 'h1', question: 'Did they make their bed?', category: 'Chores', icon: '🛏️', isActive: true },
                    { id: 'h2', question: 'Did they brush their teeth?', category: 'Health', icon: '🦷', isActive: true },
                    { id: 'h3', question: 'Did they show respect to parents?', category: 'Character', icon: '🙇', isActive: true },
                ]
            });
        });

        setParsedStudents(newStudents);
        setBulkError(newStudents.length === 0 ? 'No valid data found' : '');
    };

    const parseExcelStudents = (rows: string[][]) => {
        const newStudents: Student[] = [];
        
        const startRow = rows[0]?.some(cell => 
            typeof cell === 'string' && 
            ['name', 'student', 'age', 'belt', 'parent'].some(h => cell.toLowerCase().includes(h))
        ) ? 1 : 0;

        for (let i = startRow; i < rows.length; i++) {
            const cols = rows[i];
            if (!cols || !cols[0]) continue;
            
            const name = String(cols[0] || '').trim();
            if (!name) continue;

            const beltName = String(cols[4] || '').trim();
            let belt = data.belts.find(b => b.name.toLowerCase() === beltName?.toLowerCase());
            if (!belt) {
                const beltIdx = parseInt(beltName) - 1;
                if (!isNaN(beltIdx) && data.belts[beltIdx]) belt = data.belts[beltIdx];
            }

            newStudents.push({
                id: `student-${Date.now()}-${i}`,
                name,
                age: parseInt(String(cols[1])) || undefined,
                birthday: String(cols[2] || ''),
                gender: (['Male', 'Female', 'Other', 'Prefer not to say'].includes(String(cols[3])) ? String(cols[3]) : 'Male') as 'Male' | 'Female' | 'Other' | 'Prefer not to say',
                beltId: belt?.id || data.belts[0]?.id || 'white',
                stripes: parseInt(String(cols[5])) || 0,
                parentName: String(cols[8] || ''),
                parentEmail: String(cols[9] || ''),
                parentPhone: String(cols[10] || ''),
                location: batchLocation,
                assignedClass: batchClass || 'General Class',
                joinDate: new Date().toISOString().split('T')[0],
                totalPoints: parseInt(String(cols[6])) || 0,
                totalXP: parseInt(String(cols[7])) || 0,
                attendanceCount: 0,
                lastPromotionDate: new Date().toISOString(),
                isReadyForGrading: false,
                performanceHistory: [],
                feedbackHistory: [],
                photo: null,
                medicalInfo: '',
                badges: [],
                sparringStats: { matches: 0, wins: 0, draws: 0, headKicks: 0, bodyKicks: 0, punches: 0, takedowns: 0, defense: 0 },
                lifeSkillsHistory: [],
                customHabits: [
                    { id: 'h1', question: 'Did they make their bed?', category: 'Chores', icon: '🛏️', isActive: true },
                    { id: 'h2', question: 'Did they brush their teeth?', category: 'Health', icon: '🦷', isActive: true },
                    { id: 'h3', question: 'Did they show respect to parents?', category: 'Character', icon: '🙇', isActive: true },
                ]
            });
        }

        setParsedStudents(newStudents);
        setBulkError(newStudents.length === 0 ? 'No valid student data found. Check column order.' : '');
    };

    const handleExcelUpload = (file: File) => {
        setUploadedFileName(file.name);
        setBulkError('');
        setParsedStudents([]);
        
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
        
        if (isExcel) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const arrayBuffer = e.target?.result;
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
                    
                    const csvText = jsonData.map(row => row.join(',')).join('\n');
                    setBulkStudentData(csvText);
                    parseExcelStudents(jsonData);
                } catch (err: any) {
                    setBulkError(`Failed to parse Excel file: ${err.message || 'Unknown error'}`);
                }
            };
            reader.onerror = () => {
                setBulkError('Failed to read file. Please try again.');
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                setBulkStudentData(text);
                parseBulkStudents(text);
            };
            reader.onerror = () => {
                setBulkError('Failed to read file. Please try again.');
            };
            reader.readAsText(file);
        }
    };

    const confirmBulkImport = () => {
        const validStudents = parsedStudents.filter(s => s.beltId !== 'INVALID_BELT' && s.name);
        onUpdate({ students: [...data.students, ...validStudents] });
        setParsedStudents([]);
        setBulkStudentData('');
        setUploadedFileName('');
        setStudentAddMode('manual');
    };

    const downloadTemplate = () => {
        const csvContent = "Name,Age,Birthday,Gender,Belt,Stripes,Points,LocalXP,Parent Name,Email,Phone\nJohn Smith,12,2014-03-15,Male," + (data.belts[0]?.name || 'White') + ",0,0,0,Jane Smith,jane@email.com,555-1234";
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'student_import_template.csv';
        a.click();
        URL.revokeObjectURL(url);
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
                                    className={`px-3 py-1 rounded text-xs font-bold border ${newCoach.assignedClasses?.includes(cls) ? 'bg-sky-500 border-blue-600 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
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
                    className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors mb-6"
                >
                    Add Coach
                </button>

                <div className="space-y-2">
                    {data.coaches.map(coach => (
                        <div key={coach.id} className="flex justify-between items-center bg-gray-900/50 p-3 rounded border border-gray-700">
                            <div>
                                <p className="font-bold text-white">{coach.name}</p>
                                <p className="text-xs text-gray-400">{coach.email}</p>
                                {coach.assignedClasses && coach.assignedClasses.length > 0 && (
                                    <p className="text-xs text-sky-400 mt-1">Classes: {coach.assignedClasses.join(', ')}</p>
                                )}
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
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${studentAddMode === 'manual' ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Manual
                        </button>
                        <button 
                            onClick={() => setStudentAddMode('bulk')}
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${studentAddMode === 'bulk' ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Bulk Import
                        </button>
                    </div>
                </div>

                {studentAddMode === 'manual' ? (
                    <div className="space-y-4 mb-4">
                        <input type="text" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} placeholder="Full Name *" className="wizard-input" />
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Birthday</label>
                                <input type="date" value={newStudent.birthday} onChange={e => setNewStudent({...newStudent, birthday: e.target.value})} className="wizard-input text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Gender</label>
                                <select value={newStudent.gender || ''} onChange={e => setNewStudent({...newStudent, gender: e.target.value as any})} className="wizard-input">
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <select value={newStudent.beltId} onChange={e => setNewStudent({...newStudent, beltId: e.target.value})} className="wizard-input">
                                <option value="">Select Belt... *</option>
                                {data.belts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <input type="number" value={newStudent.stripes ?? ''} onChange={e => setNewStudent({...newStudent, stripes: parseInt(e.target.value) || 0})} placeholder="Stripes" className="wizard-input" />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Join Date</label>
                            <input type="date" value={newStudent.joinDate || new Date().toISOString().split('T')[0]} onChange={e => setNewStudent({...newStudent, joinDate: e.target.value})} className="wizard-input" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Points</label>
                                <input type="number" min="0" placeholder="0" value={newStudent.totalPoints ?? ''} onChange={e => setNewStudent({...newStudent, totalPoints: parseInt(e.target.value) || 0})} className="wizard-input" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Local HonorXP™</label>
                                <input type="number" min="0" placeholder="0" value={newStudent.totalXP ?? ''} onChange={e => setNewStudent({...newStudent, totalXP: parseInt(e.target.value) || 0})} className="wizard-input" />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">Global Shogun Rank™ points are earned through the Arena and cannot be set manually.</p>

                        <div className="grid grid-cols-2 gap-4">
                            <select value={newStudent.location} onChange={e => setNewStudent({...newStudent, location: e.target.value, assignedClass: ''})} className="wizard-input">
                                {locations.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <select value={newStudent.assignedClass} onChange={e => setNewStudent({...newStudent, assignedClass: e.target.value})} className="wizard-input">
                                <option value="">Select Class...</option>
                                {availableClassesForStudent.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div className="border-t border-gray-600 pt-4">
                            <p className="text-xs text-gray-400 mb-2 uppercase font-bold">Parent / Guardian Info</p>
                            <input type="text" value={newStudent.parentName || ''} onChange={e => setNewStudent({...newStudent, parentName: e.target.value})} placeholder="Parent Name" className="wizard-input mb-2" />
                            <input type="email" value={newStudent.parentEmail || ''} onChange={e => setNewStudent({...newStudent, parentEmail: e.target.value})} placeholder="Parent Email" className="wizard-input mb-2" />
                            <input type="tel" value={newStudent.parentPhone || ''} onChange={e => setNewStudent({...newStudent, parentPhone: e.target.value})} placeholder="Parent Phone" className="wizard-input mb-2" />
                            <p className="text-xs text-gray-400">Default password: student's first name in lowercase</p>
                        </div>

                        <div className="border-t border-gray-600 pt-4">
                            <p className="text-xs text-gray-400 mb-2 uppercase font-bold">Medical Information</p>
                            <textarea value={newStudent.medicalInfo || ''} onChange={e => setNewStudent({...newStudent, medicalInfo: e.target.value})} placeholder="Allergies, conditions, or notes..." className="wizard-input text-sm h-20 resize-none" />
                        </div>

                        <button 
                            onClick={handleAddStudent}
                            disabled={!newStudent.name || !newStudent.beltId}
                            className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
                        >
                            Add Student
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 mb-4">
                        <div className="flex bg-gray-700/50 rounded p-1 w-fit mb-4 flex-wrap gap-1">
                            <button onClick={() => setStudentImportMethod('bulk')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'bulk' ? 'bg-green-500 text-white' : 'text-gray-400'}`}>Bulk Paste</button>
                            <button onClick={() => setStudentImportMethod('excel')} className={`px-4 py-1.5 rounded text-sm font-medium ${studentImportMethod === 'excel' ? 'bg-green-500 text-white' : 'text-gray-400'}`}>Excel / File Upload</button>
                        </div>

                        {studentImportMethod === 'bulk' ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1">Default Location</label>
                                        <select value={batchLocation} onChange={e => setBatchLocation(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                            {locations.map(l => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1">Default Class</label>
                                        <select value={batchClass} onChange={e => setBatchClass(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                            <option value="">Auto-assign</option>
                                            {(data.locationClasses?.[batchLocation] || data.classes || []).map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                                    <p className="text-xs text-gray-400"><span className="font-bold">Format:</span> Name, Age, Birthday, Gender, Belt, Stripes, Points, LocalXP, Parent Name, Email, Phone</p>
                                    <button 
                                        onClick={downloadTemplate}
                                        className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
                                    >
                                        Download Template CSV
                                    </button>
                                </div>
                                <textarea value={bulkStudentData} onChange={e => { setBulkStudentData(e.target.value); setParsedStudents([]); }} placeholder="Paste CSV data here..." className="w-full h-24 bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm font-mono" />
                                <button onClick={() => parseBulkStudents(bulkStudentData)} disabled={!bulkStudentData.trim()} className="w-full bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white font-bold py-2 rounded">Paste</button>
                                {bulkError && <p className="text-red-400 text-sm">{bulkError}</p>}
                                {parsedStudents.length > 0 && (
                                    <div className="max-h-48 overflow-y-auto border border-gray-700 rounded p-2">
                                        <p className="text-xs text-gray-400 mb-2 font-bold">Preview ({parsedStudents.length}):</p>
                                        {parsedStudents.map((s, i) => (
                                            <div key={i} className="text-xs text-gray-300 py-1 border-t border-gray-800 grid grid-cols-3 gap-1">
                                                <span className="truncate">{s.name}</span>
                                                <span className="text-gray-500 truncate">{data.belts.find(b => b.id === s.beltId)?.name || '?'}</span>
                                                <span className={`truncate text-right ${s.parentEmail ? 'text-green-400' : 'text-yellow-500'}`}>
                                                    {s.parentEmail || 'No email'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button 
                                    onClick={confirmBulkImport} 
                                    disabled={parsedStudents.length === 0} 
                                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-2 rounded"
                                >
                                    Import {parsedStudents.length} Student{parsedStudents.length !== 1 ? 's' : ''}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1">Default Location</label>
                                        <select value={batchLocation} onChange={e => setBatchLocation(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                            {locations.map(l => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1">Default Class</label>
                                        <select value={batchClass} onChange={e => setBatchClass(e.target.value)} className="w-full bg-gray-700 rounded p-2 text-white text-sm">
                                            <option value="">Auto-assign</option>
                                            {(data.locationClasses?.[batchLocation] || data.classes || []).map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                
                                <div className="bg-gray-900/50 p-4 rounded border border-dashed border-gray-600 text-center">
                                    <input
                                        type="file"
                                        ref={excelFileInputRef}
                                        accept=".xlsx,.xls,.csv"
                                        onChange={(e) => e.target.files?.[0] && handleExcelUpload(e.target.files[0])}
                                        className="hidden"
                                    />
                                    <div 
                                        onClick={() => excelFileInputRef.current?.click()}
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            setIsDragging(false);
                                            if (e.dataTransfer.files?.[0]) handleExcelUpload(e.dataTransfer.files[0]);
                                        }}
                                        className={`cursor-pointer p-6 rounded transition-colors ${isDragging ? 'bg-sky-500/20 border-sky-500' : 'hover:bg-gray-800'}`}
                                    >
                                        <div className="text-4xl mb-2">📊</div>
                                        <p className="text-white font-medium mb-1">
                                            {uploadedFileName || 'Click or drag file to upload'}
                                        </p>
                                        <p className="text-xs text-gray-500">Supports .xlsx, .xls, .csv</p>
                                    </div>
                                </div>

                                <div className="bg-gray-900/50 p-3 rounded border border-gray-700">
                                    <p className="text-xs text-gray-400 font-bold mb-1">Required Column Order:</p>
                                    <p className="text-xs text-gray-500">Name, Age, Birthday, Gender, Belt, Stripes, Points, LocalXP, Parent Name, Email, Phone</p>
                                    <button 
                                        onClick={downloadTemplate}
                                        className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
                                    >
                                        Download Template
                                    </button>
                                </div>

                                {bulkError && <p className="text-red-400 text-sm">{bulkError}</p>}
                                
                                {parsedStudents.length > 0 && (
                                    <div className="max-h-48 overflow-y-auto border border-gray-700 rounded p-2">
                                        <p className="text-xs text-gray-400 mb-2 font-bold">Preview ({parsedStudents.length} students):</p>
                                        {parsedStudents.map((s, i) => (
                                            <div key={i} className="text-xs text-gray-300 py-1 border-t border-gray-800 grid grid-cols-3 gap-1">
                                                <span className="truncate">{s.name}</span>
                                                <span className="text-gray-500 truncate">{data.belts.find(b => b.id === s.beltId)?.name || 'White Belt'}</span>
                                                <span className={`truncate text-right ${s.parentEmail ? 'text-green-400' : 'text-yellow-500'}`}>
                                                    {s.parentEmail || 'No email'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <button 
                                    onClick={confirmBulkImport} 
                                    disabled={parsedStudents.length === 0} 
                                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-2 rounded"
                                >
                                    Import {parsedStudents.length} Student{parsedStudents.length !== 1 ? 's' : ''}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {data.students.slice().reverse().map(student => (
                        <div key={student.id} className="flex justify-between items-center bg-gray-900/50 p-3 rounded border border-gray-700">
                            <div>
                                <p className="font-bold text-white">{student.name} {student.age && <span className="text-xs font-normal text-gray-400">({student.age}y)</span>}</p>
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
