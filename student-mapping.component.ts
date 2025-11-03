import { Component, OnInit } from '@angular/core';
import { ApiService } from '../api.service';
import { GlobalService } from '../global.service';
import { map } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { SubjectGroup, DepartmentGroup, ProgramSchedule } from '../subject-code';

@Component({
  selector: 'app-student-mapping',
  templateUrl: './student-mapping.component.html',
  styleUrls: ['./student-mapping.component.scss']
})
export class StudentMappingComponent implements OnInit {

  rawCodes: any[] = [];
  codes: any[] = [];
  subjectId: string;
  programsAll: ProgramSchedule[] = [];
  programs: ProgramSchedule[] = [];

  activeTerm: string;
  startDate: Date | null = null;
  selectedDates: string[] = [];
  daysWithTimeSlots: { [day: string]: string[] } = {};

  timeSlots: string[] = [
    '7:30 AM-9:00 AM', '9:00 AM-10:30 AM', '10:30 AM-12:00 PM', '12:00 PM-1:30 PM',
    '1:30 PM-3:00 PM', '3:00 PM-4:30 PM', '4:30 PM-6:00 PM', '6:00 PM-7:30 PM'
  ];
  displayedColumns: string[] = ['program', ...this.timeSlots];

  termOptions = [
    { key: 1, value: '1st Term' },
    { key: 2, value: '2nd Term' },
    { key: 3, value: 'Summer' },
  ];

  combinedOptions: { label: string, value: string }[] = [];
  departments: DepartmentGroup[] = [];
  swal = Swal;
  prevSelection: { [fullSlot: string]: string } = {};
  selectedScheduleOutput: any[] = [];

  constructor(public api: ApiService, public global: GlobalService) {}

  ngOnInit() {
    this.combineYearTerm();
  }

  selectTermYear() {
    if (!this.activeTerm) {
      this.global.swalAlertError("Please select term");
      return;
    }
    console.log("Selected Term Code:", this.activeTerm);
    this.loadSwal();
    this.getCodeSummaryReport(this.activeTerm);
  }

  combineYearTerm() {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 1; y <= currentYear + 1; y++) {
      const nextYear = y + 1;
      for (const t of this.termOptions) {
        const label = `${t.value} ${y}-${nextYear}`;
        const value = `${y}${nextYear.toString().slice(-2)}${t.key}`;
        this.combinedOptions.push({ label, value });
      }
    }
  }

  onDateSelect(event: any) {
    if (!event || !event.value) return;
    const selected = event.value.toLocaleDateString('en-CA');
    if (!this.selectedDates.includes(selected)) {
      this.selectedDates.push(selected);
      this.daysWithTimeSlots[selected] = [...this.timeSlots];
      const prefix = selected + '_';
      for (let i = 0; i < this.programsAll.length; i++) {
        const p = this.programsAll[i];
        if (!p.schedule) p.schedule = {};
        for (let j = 0; j < this.timeSlots.length; j++) {
          const full = prefix + this.timeSlots[j];
          if (typeof p.schedule[full] === 'undefined') p.schedule[full] = '';
        }
      }
      this.programs = this.programsAll.filter(p => !(p.dept && p.dept.toUpperCase() === 'SAS'));
      this.updateSelectedScheduleOutput();
      this.updateRemainingSubjectsForAll();
    }
  }

  removeDate(day: string) {
    this.selectedDates = this.selectedDates.filter(d => d !== day);
    delete this.daysWithTimeSlots[day];
    const prefix = day + '_';
    for (const p of this.programsAll) {
      if (p.schedule) {
        const keys = Object.keys(p.schedule);
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (key.indexOf(prefix) === 0) delete p.schedule[key];
        }
      }
    }
    this.programs = this.programsAll.filter(p => !(p.dept && p.dept.toUpperCase() === 'SAS'));
    this.updateSelectedScheduleOutput();
  }

  getCodeSummaryReport(sy) {
    this.api.getCodeSummaryReport(sy)
      .map((response: any) => response.json())
      .subscribe(
        res => {
          this.rawCodes = res.data;
          Swal.close();
          this.codes = this.getUniqueSubjectIds(res.data);
          const allPrograms = this.getUniqueProgramsAll(res.data);
          this.programsAll = allPrograms;
          this.programs = this.programsAll.filter(p => !(p.dept && p.dept.toUpperCase() === 'SAS'));
          for (let i = 0; i < this.programsAll.length; i++) {
            const p = this.programsAll[i];
            if (!p.schedule) p.schedule = {};
            p.remainingSubjects = this.getRemainingSubjects(p);
          }
          this.updateSelectedScheduleOutput();
          console.log("Programs Loaded:", this.programsAll);
        },
        err => {
          this.global.swalAlertError(err);
        }
      );
  }

  getUniqueSubjectIds(data: any[]): SubjectGroup[] {
    const groupedID: SubjectGroup[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const existing = groupedID.find(s => s.subjectId === item.subjectId);
      if (existing) {
        existing.codes.push({
          codeNo: item.codeNo,
          course: item.course,
          year: item.yearLevel,
          dept: item.dept
        });
      } else {
        groupedID.push({
          subjectId: item.subjectId,
          subjectTitle: item.subjectTitle,
          codes: [{
            codeNo: item.codeNo,
            course: item.course,
            year: item.yearLevel,
            dept: item.dept
          }]
        });
      }
    }
    return groupedID;
  }

  getUniqueProgramsAll(data: any[]): ProgramSchedule[] {
    const groupedProg: ProgramSchedule[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const existingProgram = groupedProg.find(p => p.program === item.course && p.year === item.yearLevel);
      const subjectData = { subjectId: item.subjectId, subjectTitle: item.subjectTitle, codeNo: item.codeNo };
      if (existingProgram) {
        const exists = existingProgram.subjects.find(s => s.subjectId === subjectData.subjectId);
        if (!exists) existingProgram.subjects.push(subjectData);
      } else {
        groupedProg.push({
          program: item.course,
          year: item.yearLevel,
          dept: item.dept,
          subjects: [subjectData],
          schedule: {},
          remainingSubjects: 0
        });
      }
    }
    groupedProg.sort((a, b) => a.program.localeCompare(b.program) || Number(a.year) - Number(b.year));
    return groupedProg;
  }

  capturePrev(prog: ProgramSchedule, fullSlot: string) {
    const prev = (prog.schedule && prog.schedule[fullSlot]) ? prog.schedule[fullSlot] : '';
    this.prevSelection[fullSlot] = prev;
  }

  getAvailableSubjects(prog: ProgramSchedule, fullSlot: string) {
    const selectedSubjectIds = new Set<string>();
    for (let i = 0; i < this.programsAll.length; i++) {
      const vals = Object.values(this.programsAll[i].schedule || {});
      for (let j = 0; j < vals.length; j++) {
        const v: any = vals[j];
        if (v) selectedSubjectIds.add(v);
      }
    }
    const currentSelected = prog.schedule && prog.schedule[fullSlot] ? prog.schedule[fullSlot] : '';
    return prog.subjects.filter(subj => !selectedSubjectIds.has(subj.subjectId) || subj.subjectId === currentSelected);
  }

  onSubjectSelect(prog: ProgramSchedule, slot: string, day: string) {
  const fullSlot = `${day}_${slot}`;
  const selectedId = prog.schedule && prog.schedule[fullSlot] ? prog.schedule[fullSlot] : '';

  // --- CASE 1: UNSELECT (clear subject)
  if (!selectedId) {
    const previousSubjectId = this.prevSelection[fullSlot] || '';

    // If something was previously selected in this slot
    if (previousSubjectId) {
      // Remove that subject from ALL programs that have it in the same time slot
      for (let i = 0; i < this.programsAll.length; i++) {
        const p = this.programsAll[i];
        if (p.schedule && p.schedule[fullSlot] === previousSubjectId) {
          p.schedule[fullSlot] = '';
        }
      }
    }

    // Also remove it from prevSelection so we can reassign later
    delete this.prevSelection[fullSlot];

    this.programs = this.programsAll.filter(p => !(p.dept && p.dept.toUpperCase() === 'SAS'));
    this.updateRemainingSubjectsForAll();
    this.updateSelectedScheduleOutput();
    return;
  }

  // --- CASE 2: DUPLICATE PREVENTION
  for (let i = 0; i < this.programsAll.length; i++) {
    const vals = Object.values(this.programsAll[i].schedule || {});
    if (vals.includes(selectedId)) {
      const p = this.programsAll[i];
      if (!(p.program === prog.program && p.year === prog.year && p.schedule[fullSlot] === selectedId)) {
        this.global.swalAlertError("This subject is already assigned in another slot.");
        prog.schedule[fullSlot] = '';
        return;
      }
    }
  }

  // --- CASE 3: SELECT (assign to all programs with that subject)
  for (let i = 0; i < this.programsAll.length; i++) {
    const p = this.programsAll[i];
    if (p.subjects.find(s => s.subjectId === selectedId)) {
      if (!p.schedule) p.schedule = {};
      p.schedule[fullSlot] = selectedId;
    }
  }

  this.programs = this.programsAll.filter(p => !(p.dept && p.dept.toUpperCase() === 'SAS'));
  this.updateRemainingSubjectsForAll();
  this.updateSelectedScheduleOutput();

  // Store the previous selection for this slot (for unselect tracking)
  this.prevSelection[fullSlot] = selectedId;
}


  // global counter logic (syncs across all days)
  updateRemainingSubjectsForAll() {
    for (let i = 0; i < this.programs.length; i++) {
      const p = this.programs[i];
      p.remainingSubjects = this.getRemainingSubjectsConsideringAllDays(p);
    }
  }

  getRemainingSubjectsConsideringAllDays(prog: ProgramSchedule): number {
    const total = (prog.subjects || []).length;
    const assigned = new Set<string>();
    const keys = Object.keys(prog.schedule || {});
    for (let i = 0; i < keys.length; i++) {
      const val = prog.schedule[keys[i]];
      if (val) assigned.add(val);
    }
    return total - assigned.size;
  }

  getRemainingSubjects(prog: ProgramSchedule): number {
    const total = (prog.subjects || []).length;
    const assignedCount = Object.values(prog.schedule || {}).filter((v: any) => v).length;
    return total - assignedCount;
  }

  updateSelectedScheduleOutput() {
    this.selectedScheduleOutput = [];
    for (let d = 0; d < this.selectedDates.length; d++) {
      const day = this.selectedDates[d];
      const programsForDay: any[] = [];
      for (let i = 0; i < this.programs.length; i++) {
        const p = this.programs[i];
        const subjArr: any[] = [];
        const keys = Object.keys(p.schedule || {});
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (key.startsWith(day + '_')) {
            const subjId = p.schedule[key];
            if (subjId) {
              const subj = p.subjects.find(s => s.subjectId === subjId);
              subjArr.push({
                subjectId: subj ? subj.subjectId : '',
                subjectTitle: subj ? subj.subjectTitle : '',
                codeNo: subj ? subj.codeNo : '',
                sched: key.replace(day + '_', '')
              });
            }
          }
        }
        programsForDay.push({ program: p.program, year: p.year, subjects: subjArr });
      }
      this.selectedScheduleOutput.push({ date: day, programs: programsForDay });
    }
  }

  saveSchedule() {
    console.log("Final Schedule Output:", this.selectedScheduleOutput);
    this.global.swalSuccess("Schedule saved successfully!");
  }

  loadSwal() {
    this.swal.fire({
      title: 'Loading',
      text: '',
      type: 'info',
      allowOutsideClick: false,
      allowEscapeKey: false,
      onOpen: function() {
        Swal.showLoading();
      }
    });
  }
}