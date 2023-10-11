// 0 dependence r1cs file parser

function LEBytesToBigInt(_bytes) {
  const bytes = new Uint8Array(_bytes)
  let out = 0n
  for (let x = 0; x < bytes.length; x++) {
    out += BigInt(bytes[x]) * (1n << BigInt(8*x))
  }
  return out
}

function LEBytesToUint(bytes) {
  if (bytes.byteLength > 6) {
    throw new Error('Byte array too long for uint')
  }
  return Number(LEBytesToBigInt(bytes))
}

export class R1CS {
  get data() {
    return this._data
  }

  clone() {
    return new this.constructor(this._view.buffer.slice())
  }

  constructor(buffer) {
    this._data = {}
    this._view = new DataView(buffer)
    this._offset = 0

    this._parseInitial()
  }

  _parseInitial() {
    // read and check the magic value
    let offset = 0
    this.magicR1cs = this._view.getUint32(offset, true)
    offset += 4

    this.version = this._view.getUint32(offset, true)
    offset += 4

    this.sectionCount = this._view.getUint32(offset, true)
    offset += 4
  }

  parse() {
    this.readSections()
    for (const k of Object.keys(this._sections)) {
      this.parseSection(k)
    }
    return this.data
  }

  readSections() {
    if (this._sections) return
    const sections = {}
    // skip the header then begin parsing
    let offset = 12
    for (let x = 0; x < this.sectionCount; x++) {
      const sectionType = this._view.getUint32(offset, true)
      offset += 4
      const sectionLength = this._view.getBigInt64(offset, true)
      offset += 8
      sections[sectionType] = {
        offset,
        length: sectionLength,
        type: sectionType,
      }
      offset += Number(sectionLength)
    }
    this._sections = sections
  }

  parseSection(index) {
    const section = this._sections[index]
    if (!section) throw new Error(`Unable to find section ${index}`)
    const { offset, length, type } = section

    if (typeof this[`_parseSection${section.type}`] === 'undefined') {
      throw new Error(`Unknown section type: ${section.type}`)
    }
    if (section.parsed) return
    if (section.type > 3 && section.type <= 5) {
      throw new Error('Support for custom gates is not implemented')
    } else if (section.type > 5) {
      this._sections[index].parsed = true
      return
    }
    this[`_parseSection${section.type}`](section)
    this._sections[index].parsed = true
  }

  // the header section, specifies number of constraints, vars, etc
  _parseSection1({ offset: _offset, length, type }) {
    let offset = _offset
    const fieldSize = this._view.getUint32(offset, true)
    offset += 4
    const prime = LEBytesToBigInt(this._view.buffer.slice(offset, offset + fieldSize))
    offset += fieldSize
    const nWires = this._view.getUint32(offset, true)
    offset += 4
    const nOutputs = this._view.getUint32(offset, true)
    offset += 4
    const nPubInputs = this._view.getUint32(offset, true)
    offset += 4
    const nPrvInputs = this._view.getUint32(offset, true)
    offset += 4
    const nLabels = this._view.getBigInt64(offset, true)
    offset += 8
    const nConstraints = this._view.getUint32(offset, true)
    offset += 4

    Object.assign(this._data, {
      fieldSize,
      prime,
      nWires,
      nVars: nWires, // for compat with r1csfile
      nOutputs,
      nPubInputs,
      nPrvInputs,
      nLabels,
      nConstraints,
    })
  }

  // constraints section
  _parseSection2({ offset: _offset, length, type }) {
    let offset = _offset
    const constraints = []
    const parseTerm = (__offset) => {
      const t = {}
      // the number of terms in the linear combination
      const nT = this._view.getUint32(__offset, true)
      __offset += 4
      for (let y = 0; y < nT; y++) {
        const wireId = this._view.getUint32(__offset, true)
        __offset += 4
        const constant = LEBytesToBigInt(this._view.buffer.slice(__offset, __offset + this._data.fieldSize))
        __offset += this._data.fieldSize
        t[wireId] = constant
      }
      return [t, __offset]
    }
    for (let x = 0; x < this._data.nConstraints; x++) {
      const constraint = []
      {
        const [a, _] = parseTerm(offset)
        constraint.push(a)
        offset = _
      }
      {
        const [b, _] = parseTerm(offset)
        constraint.push(b)
        offset = _
      }
      {
        const [c, _] = parseTerm(offset)
        constraint.push(c)
        offset = _
      }
      constraints.push(constraint)
    }
    Object.assign(this._data, { constraints })
  }

  // wire id to label map
  _parseSection3({ offset: _offset, length, type }) {
    return

    /**
     * Label parsing is disabled in this implementation as it seems
     * to be unnecessary. In practice this is a list of n values where
     * value is simply 1, 2, 3, 4, 5, ... n
     *
     * e.g. wires are labeled as increasing integers
     **/
    let offset = _offset
    const labels = []
    for (; offset < Number(length)+_offset;) {
      const l = this._view.getBigInt64(offset, true)
      offset += 8
      labels.push(l)
    }
    Object.assign(this._data, {
      labels,
      nLabels: labels.length,
    })
  }
}
