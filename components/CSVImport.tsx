import React, { useState, useRef } from 'react';

interface CSVImportProps {
  onImport: (students: ImportedStudent[]) => void;
  onClose: () => void;
  existingBelts: { id: string; name: string }[];
}

export interface ImportedStudent {
  name: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  beltId: string;
  birthday: string | null;
  totalPoints: number;
  totalXP: number;
  globalXP: number;
}

interface ColumnMapping {
  name: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  belt: string;
  birthday: string;
  points: string;
  xp: string;
  globalXP: string;
}

export const CSVImport: React.FC<CSVImportProps> = ({ onImport, onClose, existingBelts }) => {
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'importing'>('upload');
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: '',
    parentName: '',
    parentEmail: '',
    parentPhone: '',
    belt: '',
    birthday: '',
    points: '',
    xp: '',
    globalXP: ''
  });
  const [previewData, setPreviewData] = useState<ImportedStudent[]>([]);
  const [importGlobalXP, setImportGlobalXP] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    return lines.map(line => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      
      if (parsed.length < 2) {
        alert('CSV must have at least a header row and one data row');
        return;
      }

      setHeaders(parsed[0]);
      setCsvData(parsed.slice(1));
      
      // Auto-detect column mappings
      const headerLower = parsed[0].map(h => h.toLowerCase());
      const autoMapping: ColumnMapping = {
        name: parsed[0].find((_, i) => headerLower[i].includes('student') || headerLower[i].includes('name') && !headerLower[i].includes('parent')) || '',
        parentName: parsed[0].find((_, i) => headerLower[i].includes('parent') && headerLower[i].includes('name')) || '',
        parentEmail: parsed[0].find((_, i) => headerLower[i].includes('email')) || '',
        parentPhone: parsed[0].find((_, i) => headerLower[i].includes('phone') || headerLower[i].includes('mobile')) || '',
        belt: parsed[0].find((_, i) => headerLower[i].includes('belt') || headerLower[i].includes('rank') || headerLower[i].includes('level')) || '',
        birthday: parsed[0].find((_, i) => headerLower[i].includes('birth') || headerLower[i].includes('dob') || headerLower[i].includes('date of birth')) || '',
        points: parsed[0].find((_, i) => headerLower[i].includes('point') && !headerLower[i].includes('xp')) || '',
        xp: parsed[0].find((_, i) => headerLower[i].includes('xp') && !headerLower[i].includes('global')) || '',
        globalXP: parsed[0].find((_, i) => headerLower[i].includes('global') && headerLower[i].includes('xp')) || ''
      };
      
      setMapping(autoMapping);
      setStep('map');
    };
    reader.readAsText(file);
  };

  const matchBelt = (beltName: string): string => {
    if (!beltName) return existingBelts[0]?.id || 'white';
    const normalized = beltName.toLowerCase().trim();
    const match = existingBelts.find(b => 
      b.name.toLowerCase().includes(normalized) || 
      b.id.toLowerCase().includes(normalized) ||
      normalized.includes(b.name.toLowerCase())
    );
    return match?.id || existingBelts[0]?.id || 'white';
  };

  const handlePreview = () => {
    const students: ImportedStudent[] = csvData.map(row => {
      const getVal = (key: keyof ColumnMapping) => {
        const colName = mapping[key];
        if (!colName) return '';
        const idx = headers.indexOf(colName);
        return idx >= 0 ? row[idx] || '' : '';
      };

      const parseNum = (val: string): number => {
        const num = parseInt(val.replace(/[^0-9-]/g, ''), 10);
        return isNaN(num) ? 0 : num;
      };

      const parseBirthday = (val: string): string | null => {
        if (!val) return null;
        try {
          const date = new Date(val);
          if (isNaN(date.getTime())) return null;
          return date.toISOString().split('T')[0];
        } catch {
          return null;
        }
      };

      return {
        name: getVal('name'),
        parentName: getVal('parentName'),
        parentEmail: getVal('parentEmail'),
        parentPhone: getVal('parentPhone'),
        beltId: matchBelt(getVal('belt')),
        birthday: parseBirthday(getVal('birthday')),
        totalPoints: parseNum(getVal('points')),
        totalXP: parseNum(getVal('xp')),
        globalXP: importGlobalXP ? parseNum(getVal('globalXP')) : 0
      };
    }).filter(s => s.name.trim() !== '');

    setPreviewData(students);
    setStep('preview');
  };

  const handleImport = () => {
    setStep('importing');
    onImport(previewData);
  };

  const getBeltName = (beltId: string) => {
    return existingBelts.find(b => b.id === beltId)?.name || beltId;
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">Import Students from CSV</h2>
            <p className="text-gray-400 mt-1">
              {step === 'upload' && 'Upload your Google Sheets export (CSV file)'}
              {step === 'map' && 'Map your columns to TaekUp fields'}
              {step === 'preview' && `Preview ${previewData.length} students to import`}
              {step === 'importing' && 'Importing students...'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-600 hover:border-cyan-500 rounded-2xl p-12 cursor-pointer transition-all text-center"
              >
                <div className="text-6xl mb-4">📄</div>
                <p className="text-xl text-white font-bold mb-2">Click to upload CSV file</p>
                <p className="text-gray-400">Export your Google Sheet as CSV first</p>
              </div>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="mt-8 bg-gray-800 p-4 rounded-lg max-w-lg">
                <p className="text-sm text-gray-400">
                  <strong className="text-white">How to export from Google Sheets:</strong><br/>
                  File → Download → Comma Separated Values (.csv)
                </p>
              </div>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-6">
              <div className="bg-gray-800 p-4 rounded-lg mb-6">
                <p className="text-sm text-gray-400">
                  Found <strong className="text-cyan-400">{csvData.length}</strong> rows and <strong className="text-cyan-400">{headers.length}</strong> columns. 
                  We auto-detected some mappings. Adjust if needed.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'name', label: 'Student Name', required: true },
                  { key: 'parentName', label: 'Parent Name', required: false },
                  { key: 'parentEmail', label: 'Parent Email', required: false },
                  { key: 'parentPhone', label: 'Parent Phone', required: false },
                  { key: 'belt', label: 'Belt / Rank', required: false },
                  { key: 'birthday', label: 'Birthday', required: false },
                  { key: 'points', label: 'Points (Grading)', required: false },
                  { key: 'xp', label: 'XP (HonorXP)', required: false },
                ].map(field => (
                  <div key={field.key} className="bg-gray-800 p-4 rounded-lg">
                    <label className="block text-sm font-bold text-gray-300 mb-2">
                      {field.label} {field.required && <span className="text-red-400">*</span>}
                    </label>
                    <select
                      value={mapping[field.key as keyof ColumnMapping]}
                      onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                      className="w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                    >
                      <option value="">-- Not mapped --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="bg-yellow-900/30 border border-yellow-500/30 p-4 rounded-lg mt-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={importGlobalXP}
                    onChange={(e) => setImportGlobalXP(e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <div>
                    <span className="text-white font-bold">Import Global XP for World Rankings</span>
                    <p className="text-sm text-gray-400">Only enable if you tracked Global XP separately. Otherwise leave unchecked for fairness.</p>
                  </div>
                </label>
                {importGlobalXP && (
                  <select
                    value={mapping.globalXP}
                    onChange={(e) => setMapping({ ...mapping, globalXP: e.target.value })}
                    className="mt-3 w-full bg-gray-700 text-white rounded-lg p-3 border border-gray-600"
                  >
                    <option value="">-- Select Global XP column --</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-800 text-gray-400 text-sm uppercase">
                      <th className="p-3">Name</th>
                      <th className="p-3">Parent</th>
                      <th className="p-3">Belt</th>
                      <th className="p-3">Points</th>
                      <th className="p-3">XP</th>
                      {importGlobalXP && <th className="p-3">Global XP</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 20).map((student, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="p-3 text-white font-medium">{student.name}</td>
                        <td className="p-3 text-gray-400">{student.parentName || student.parentEmail || '-'}</td>
                        <td className="p-3 text-cyan-400">{getBeltName(student.beltId)}</td>
                        <td className="p-3 text-green-400">{student.totalPoints.toLocaleString()}</td>
                        <td className="p-3 text-yellow-400">{student.totalXP.toLocaleString()}</td>
                        {importGlobalXP && <td className="p-3 text-purple-400">{student.globalXP.toLocaleString()}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.length > 20 && (
                  <p className="text-center text-gray-500 py-4">
                    ... and {previewData.length - 20} more students
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="animate-spin text-6xl mb-4">⏳</div>
              <p className="text-xl text-white">Importing {previewData.length} students...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex justify-between">
          <button 
            onClick={() => step === 'upload' ? onClose() : setStep(step === 'map' ? 'upload' : step === 'preview' ? 'map' : 'upload')}
            className="px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            disabled={step === 'importing'}
          >
            {step === 'upload' ? 'Cancel' : 'Back'}
          </button>
          
          {step === 'map' && (
            <button 
              onClick={handlePreview}
              disabled={!mapping.name}
              className="px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview Import
            </button>
          )}
          
          {step === 'preview' && (
            <button 
              onClick={handleImport}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 font-bold"
            >
              Import {previewData.length} Students
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
